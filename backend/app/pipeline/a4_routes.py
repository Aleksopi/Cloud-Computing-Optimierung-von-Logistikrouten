"""
Step 4 — Route Optimisation (last-mile + backbone)
Fully DB-driven, multi-objective greedy VRP (cost + time + CO₂).

Distances are **road-network distances** from OSRM (one /table call per depot),
not straight-line Haversine — these km drive stop selection, range, time, cost
and CO₂. Haversine is only a fallback when OSRM is unavailable.

Last-mile (Hub → Apotheke): vehicles with can_last_mile=True, small-first.
Backbone  (HQ → VZ, VZ → mVZ): vehicles with can_backbone=True, large-first.
Every vehicle performs a multi-stop tour (depot → stop → stop → … → depot).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import requests as _http

from app.config import settings
from app.db.models import Assignment, Hub, Pharmacy, SystemConfig, VehicleFleetConfig, VehicleRoute
from app.services import tomtom
from app.services.osrm import osrm_distance_matrix
from app.services.traffic import effective_factor, resolve as resolve_traffic

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _road_geometry(waypoints: list[list[float]]) -> list[list[float]]:
    if len(waypoints) < 2:
        return waypoints
    coords = ";".join(f"{lon},{lat}" for lon, lat in waypoints)
    url = f"{settings.osrm_url}/route/v1/driving/{coords}?overview=full&geometries=geojson"
    try:
        resp = _http.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()["routes"][0]["geometry"]["coordinates"]
    except Exception as exc:
        logger.warning(f"OSRM route geometry failed ({exc}), using straight lines")
        return waypoints


def _hav_matrix(nodes: list[tuple[float, float]]) -> np.ndarray:
    """Vectorised Haversine distance matrix (km) — straight-line fallback."""
    lat = np.radians(np.array([n[0] for n in nodes], dtype=np.float64))
    lon = np.radians(np.array([n[1] for n in nodes], dtype=np.float64))
    dlat = lat[:, None] - lat[None, :]
    dlon = lon[:, None] - lon[None, :]
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:, None]) * np.cos(lat[None, :]) * np.sin(dlon / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def _road_matrix(nodes: list[tuple[float, float]]) -> np.ndarray:
    """Road-network distance matrix (km) over [depot, stop_1, …, stop_n].

    Uses OSRM; falls back to Haversine entirely when OSRM is unavailable, and
    patches individual unreachable pairs with their straight-line distance."""
    hv = _hav_matrix(nodes)
    road = osrm_distance_matrix(nodes)
    if road is None or road.shape != hv.shape:
        return hv
    if not np.isfinite(road).all():
        road = np.where(np.isfinite(road), road, hv)
    np.fill_diagonal(road, 0.0)
    return road


def _nrm(x: float, xs: list[float]) -> float:
    """Min-max normalise ``x`` within ``xs`` → [0, 1] (0 when all values equal)."""
    lo, hi = min(xs), max(xs)
    return 0.0 if hi <= lo else (x - lo) / (hi - lo)


def _weighted_stop_score(marg_km: float, leg_km: float, drive_h: float,
                         margs: list[float], legs: list[float], drives: list[float],
                         opt: dict) -> float:
    """Multi-objective next-stop score (lower = better), genuinely weight-sensitive.

    Each objective minimises a *different* per-candidate quantity, so the three
    weights move the route in distinct directions (instead of all collapsing onto
    "nearest", which made the weights inert):

    * **Kosten**  → marginal tour-length added by the stop (incl. the return leg):
      ``d(here→stop) + d(stop→depot) − d(here→depot)`` ⇒ compact, low-km tours.
    * **Umwelt**  → the immediately added driving distance ``d(here→stop)``
      (emissions of the next leg).
    * **Zeit**    → the **traffic-adjusted** driving time of the next leg
      (``drive_h``) ⇒ avoids congested legs; diverges from distance under
      live TomTom / simulated traffic, so the weights also bite *with* live traffic.

    Components are min-max normalised across the current candidate set so each
    weight has balanced leverage regardless of the raw unit scales."""
    return (opt["weight_cost"] * _nrm(marg_km, margs)
            + opt["weight_env"]  * _nrm(leg_km,  legs)
            + opt["weight_time"] * _nrm(drive_h, drives))


def _unrouted_reason(stop: dict, dmat, vehicles: list[dict], opt: dict) -> str:
    """Best-effort explanation why an assigned stop could not be routed in Step 4.

    Evaluated against the *most capable* vehicle of the fleet (largest capacity,
    longest range, fastest) — if even that cannot serve the stop the reason is a
    hard constraint; otherwise the hub simply ran out of vehicle/shift budget."""
    node     = stop["_node"]
    demand   = stop["demand"]
    unlimited = any(v["capacity"] is None for v in vehicles)
    max_cap  = max([v["capacity"] for v in vehicles if v["capacity"]] or [0])
    max_rng  = max(v["range_km"]  for v in vehicles)
    max_spd  = max(v["speed_kmh"] for v in vehicles)
    min_svc  = min(v["service_min"] for v in vehicles)
    round_trip = float(dmat[0, node]) + float(dmat[node, 0])

    if not unlimited and max_cap and demand > max_cap:
        return "Bedarf übersteigt Fahrzeugkapazität"
    if round_trip > max_rng:
        return "Entfernung übersteigt Fahrzeugreichweite"
    drive_direct = float(dmat[0, node]) / max(1e-6, max_spd) * opt["traffic_factor"]
    open_h, close_h = stop.get("open_hour", 0.0), stop.get("close_hour", 24.0)
    arrival = opt.get("shift_start", 8.0) + drive_direct
    if close_h < 24.0 and arrival + min_svc / 60.0 > close_h:
        return "Außerhalb der Öffnungszeiten erreichbar"
    if drive_direct + min_svc / 60.0 > opt["shift_hours"]:
        return "Fahrzeit übersteigt Schichtlänge"
    return "Hub-Kapazität/Schicht erschöpft"


# ── Generalised multi-stop VRP solver ──────────────────────────────────────────

def _solve_vrp(
    depot_name: str,
    depot_lat: float,
    depot_lon: float,
    stops: list[dict],          # [{id, lat, lon, demand}, ...]
    vehicles: list[dict],       # plain dicts, in deployment order
    opt: dict,
    use_tomtom: bool = False,
    tomtom_key: str | None = None,
) -> tuple[list[dict], list[dict]]:
    """Greedy multi-objective VRP. Deploys each vehicle type up to max_per_hub.
    Each vehicle drives a multi-stop tour; the next stop minimises the weighted,
    normalised cost/time/CO₂ score (see ``_weighted_stop_score``).

    Returns ``(routes, unrouted)`` where ``unrouted`` is the list of stop dicts
    that no vehicle could serve, each annotated with a ``reason``.

    Distances come from a road-network matrix over [depot, stop_1, …, stop_n];
    every stop carries its matrix index in ``_node`` (depot = 0). When ``use_tomtom``
    is set a traffic-aware travel-time matrix (hours) is fetched from TomTom and
    drives the time component; missing/failed entries fall back to
    ``distance / speed × traffic_factor`` (the simulation/static behaviour)."""
    routes: list[dict] = []
    remaining = list(stops)

    # Road-network distance matrix (km) over depot + all stops; depot is node 0.
    nodes = [(depot_lat, depot_lon)] + [(s["lat"], s["lon"]) for s in stops]
    dmat = _road_matrix(nodes)
    tmat, hub_traffic_error = (tomtom.matrix_durations_h(tomtom_key, nodes) if use_tomtom else (None, None))
    route_source = "tomtom" if tmat is not None else opt.get("fallback_source", "static")
    for k, s in enumerate(stops, start=1):
        s["_node"] = k

    def _drive_h(i: int, j: int, d_km: float, speed: float) -> float:
        """Traffic-adjusted driving hours for edge i→j. TomTom matrix if finite,
        else free-flow time scaled by the configured traffic factor."""
        if tmat is not None:
            t = float(tmat[i, j])
            if np.isfinite(t):
                return t
        return (d_km / speed) * opt["traffic_factor"]

    for vconf in vehicles:
        if not remaining:
            break
        cap         = vconf["capacity"]                 # None = unlimited
        range_km    = vconf["range_km"]
        cost_km     = vconf["cost_per_km"]
        co2_g_km    = vconf["co2_g_per_km"]
        speed       = vconf["speed_kmh"]
        driver_h    = vconf["driver_chf_h"]
        svc_min     = vconf["service_min"]
        max_n       = vconf["max_per_hub"]
        restock_thr = vconf["restock_threshold"]
        vname       = vconf["name"]

        for vnum in range(1, max_n + 1):
            if not remaining:
                break
            vehicle_id   = f"{depot_name}_{vname}_{vnum}"
            route_ids: list = []
            stop_coords: list[list[float]] = [[depot_lon, depot_lat]]
            items_loaded = cap if cap else 10_000_000
            km_used = hours_used = total_co2_g = 0.0
            free_flow_h = 0.0   # drive hours at free flow (no congestion) — to-stop legs
            total_items  = 0
            restock_done = 0
            cur_idx = 0  # start at the depot (matrix node 0)

            while remaining:
                # ── Phase 1: gather all feasible candidates for the next stop ──
                cand: list[dict] = []
                for idx, stop in enumerate(remaining):
                    if stop["demand"] > items_loaded:
                        continue
                    d_to   = float(dmat[cur_idx, stop["_node"]])    # road km here→stop
                    d_back = float(dmat[stop["_node"], 0])          # road km stop→depot
                    if km_used + d_to + d_back > range_km:
                        continue
                    drive_h = _drive_h(cur_idx, stop["_node"], d_to, speed)
                    if hours_used + drive_h + svc_min / 60.0 > opt["shift_hours"]:
                        continue
                    # ── Opening-hours constraint ───────────────────────────
                    arrival_h  = opt.get("shift_start", 8.0) + hours_used + drive_h
                    stop_open  = stop.get("open_hour",  0.0)
                    stop_close = stop.get("close_hour", 24.0)
                    if stop_open  > 0.0  and arrival_h < stop_open:
                        continue   # arrives before opening (no waiting in model)
                    if stop_close < 24.0 and arrival_h + svc_min / 60.0 > stop_close:
                        continue   # service would exceed closing time
                    # Marginal tour-length added (incl. the new return leg) — the
                    # cost objective; the immediate leg distance feeds the CO₂
                    # objective and the traffic-adjusted time the time objective.
                    d_cur_back = float(dmat[cur_idx, 0])
                    cand.append({"idx": idx, "d_to": d_to, "drive_h": drive_h,
                                 "marg": d_to + d_back - d_cur_back})

                if not cand:
                    break

                # ── Phase 2: weighted, normalised multi-objective choice ──────
                margs  = [c["marg"]    for c in cand]
                legs   = [c["d_to"]    for c in cand]
                drives = [c["drive_h"] for c in cand]
                best = min(cand, key=lambda c: (
                    _weighted_stop_score(c["marg"], c["d_to"], c["drive_h"], margs, legs, drives, opt),
                    c["d_to"]))   # tie-break: nearest leg
                best_idx, best_d, best_drive = best["idx"], best["d_to"], best["drive_h"]

                stop = remaining.pop(best_idx)
                route_ids.append(stop["id"])
                stop_coords.append([stop["lon"], stop["lat"]])
                items_loaded -= stop["demand"]
                total_items  += stop["demand"]
                km_used      += best_d
                total_co2_g  += best_d * co2_g_km
                hours_used   += best_drive + svc_min / 60.0
                free_flow_h  += best_d / speed
                cur_idx       = stop["_node"]

            if route_ids:
                d_ret        = float(dmat[cur_idx, 0])   # road km back to depot
                km_used     += d_ret
                total_co2_g += d_ret * co2_g_km
                stop_coords.append([depot_lon, depot_lat])
                # Realised drive time (to-stop legs) vs free flow → route traffic factor
                drive_realised = hours_used - len(route_ids) * (svc_min / 60.0)
                route_factor   = round(drive_realised / free_flow_h, 3) if free_flow_h > 1e-6 else opt["traffic_factor"]
                routes.append(dict(
                    hub_name=depot_name,
                    vehicle_id=vehicle_id,
                    vehicle_type=vname,
                    stops=route_ids,
                    stop_coords=_road_geometry(stop_coords),
                    total_km=round(km_used, 2),
                    total_hours=round(hours_used, 2),
                    total_items=total_items,
                    total_cost_chf=round(km_used * cost_km + hours_used * driver_h, 2),
                    co2_kg=round(total_co2_g / 1000.0, 3),
                    restock_count=restock_done,
                    traffic_factor=route_factor,
                    traffic_source=route_source,
                    free_flow_hours=round(free_flow_h, 3),
                    traffic_error=hub_traffic_error,   # aggregated by run_routes (not persisted)
                ))

    unrouted: list[dict] = []
    for stop in remaining:
        stop["reason"] = _unrouted_reason(stop, dmat, vehicles, opt)
        unrouted.append(stop)
    if unrouted:
        logger.warning(f"[Step 4] {depot_name}: {len(unrouted)} stops unrouted (capacity/range/hours)")
    return routes, unrouted


def _force_route(
    depot_name: str, depot_lat: float, depot_lon: float,
    stops: list[dict], vehicle: dict, opt: dict,
) -> list[dict]:
    """Guaranteed-delivery pass for the "alle Apotheken beliefern" option.

    Routes every leftover stop with the single most-capable last-mile vehicle,
    **ignoring** the shift-length and opening-hours limits (and not pruning by
    range) so no pharmacy is left behind. Capacity is still respected via
    in-tour restocks (return to depot, reload). Realised km/time/CO₂/cost are
    computed normally so the route shows up faithfully in the analytics."""
    if not stops:
        return []
    nodes = [(depot_lat, depot_lon)] + [(s["lat"], s["lon"]) for s in stops]
    dmat = _road_matrix(nodes)
    for k, s in enumerate(stops, start=1):
        s["_node"] = k

    cap      = vehicle["capacity"] if vehicle["capacity"] else 10_000_000
    co2_g_km = vehicle["co2_g_per_km"]
    speed    = vehicle["speed_kmh"]
    cost_km  = vehicle["cost_per_km"]
    driver_h = vehicle["driver_chf_h"]
    svc_min  = vehicle["service_min"]
    vname    = vehicle["name"]
    tf       = opt["traffic_factor"]

    remaining = list(stops)
    vehicle_id = f"{depot_name}_{vname}_Zwang"
    route_ids: list = []
    stop_coords: list[list[float]] = [[depot_lon, depot_lat]]
    items_loaded = cap
    km_used = hours_used = total_co2_g = free_flow_h = 0.0
    total_items = restock_done = 0
    cur_idx = 0

    while remaining:
        # Nearest leftover stop by road distance (forced = pure distance greedy).
        best_idx = min(range(len(remaining)), key=lambda i: float(dmat[cur_idx, remaining[i]["_node"]]))
        stop = remaining[best_idx]
        # Reload only if it actually helps — i.e. we are not already fully loaded.
        # A single stop whose demand exceeds full capacity is delivered anyway
        # (one forced trip), which also prevents an infinite reload loop.
        if stop["demand"] > items_loaded and route_ids and items_loaded < cap:
            # Reload: drive back to depot, refill, restart the tour from there.
            d_back = float(dmat[cur_idx, 0])
            km_used += d_back; total_co2_g += d_back * co2_g_km
            hours_used += d_back / speed * tf; free_flow_h += d_back / speed
            stop_coords.append([depot_lon, depot_lat])
            items_loaded = cap; restock_done += 1; cur_idx = 0
            continue
        remaining.pop(best_idx)
        d_to = float(dmat[cur_idx, stop["_node"]])
        route_ids.append(stop["id"])
        stop_coords.append([stop["lon"], stop["lat"]])
        items_loaded -= stop["demand"]; total_items += stop["demand"]
        km_used += d_to; total_co2_g += d_to * co2_g_km
        hours_used += d_to / speed * tf + svc_min / 60.0
        free_flow_h += d_to / speed
        cur_idx = stop["_node"]

    d_ret = float(dmat[cur_idx, 0])
    km_used += d_ret; total_co2_g += d_ret * co2_g_km
    hours_used += d_ret / speed * tf; free_flow_h += d_ret / speed
    stop_coords.append([depot_lon, depot_lat])
    route_factor = round(tf, 3)
    return [dict(
        hub_name=depot_name, vehicle_id=vehicle_id, vehicle_type=vname,
        stops=route_ids, stop_coords=_road_geometry(stop_coords),
        total_km=round(km_used, 2), total_hours=round(hours_used, 2),
        total_items=total_items,
        total_cost_chf=round(km_used * cost_km + hours_used * driver_h, 2),
        co2_kg=round(total_co2_g / 1000.0, 3), restock_count=restock_done,
        traffic_factor=route_factor, traffic_source=opt.get("fallback_source", "static"),
        free_flow_hours=round(free_flow_h, 3), traffic_error=None, forced=True,
    )]


def _weighted_vehicle_order(vehicles: list[dict], weights: dict) -> list[dict]:
    """Order vehicle types by the optimisation weights so the weights actually
    influence WHICH vehicle is deployed (the per-stop greedy score is distance-
    proportional and therefore weight-insensitive on its own).

    Combined score per type (lower = deployed first):
        w_cost·norm(cost_per_km) + w_time·norm(1/speed) + w_env·norm(co2_g_per_km)
    → cost-focus picks the cheapest, eco the lowest-CO₂, time the fastest first."""
    if len(vehicles) <= 1:
        return list(vehicles)
    costs     = [v["cost_per_km"] for v in vehicles]
    co2s      = [v["co2_g_per_km"] for v in vehicles]
    inv_speed = [1.0 / max(1e-6, v["speed_kmh"]) for v in vehicles]

    def _norm(x, xs):
        lo, hi = min(xs), max(xs)
        return 0.0 if hi <= lo else (x - lo) / (hi - lo)

    wc = weights.get("weight_cost", 0.40)
    wt = weights.get("weight_time", 0.35)
    we = weights.get("weight_env",  0.25)

    def _score(v):
        return (wc * _norm(v["cost_per_km"], costs)
                + wt * _norm(1.0 / max(1e-6, v["speed_kmh"]), inv_speed)
                + we * _norm(v["co2_g_per_km"], co2s))

    return sorted(vehicles, key=_score)


def _to_dicts(rows: list[VehicleFleetConfig]) -> list[dict]:
    return [
        dict(
            name=v.name, capacity=v.capacity, range_km=v.range_km,
            cost_per_km=v.cost_per_km, co2_g_per_km=v.co2_g_per_km, speed_kmh=v.speed_kmh,
            driver_chf_h=float(v.driver_chf_h or 0), service_min=int(v.service_min or 20),
            max_per_hub=int(v.max_per_hub or 5), restock_threshold=int(v.restock_threshold or 5),
        )
        for v in rows
    ]


# ── Orchestrator ──────────────────────────────────────────────────────────────

def run_routes(db) -> None:
    all_veh = db.query(VehicleFleetConfig).filter(VehicleFleetConfig.enabled == True).all()  # noqa: E712

    # Last-mile fleet: small vehicles first (sort_order ascending)
    last_mile_veh = _to_dicts(sorted(
        [v for v in all_veh if v.can_last_mile], key=lambda v: v.sort_order))
    # Backbone fleet: large capacity first (bulk haul by train/LKW before vans)
    backbone_veh = _to_dicts(sorted(
        [v for v in all_veh if v.can_backbone], key=lambda v: -(v.capacity or 0)))

    # Config values are strings (some non-numeric, e.g. traffic_mode/tomtom_api_key).
    sys_str = {c.key: c.value for c in db.query(SystemConfig).all()}

    def _cf(key: str, default: float) -> float:
        try:
            return float(sys_str.get(key, default))
        except (TypeError, ValueError):
            return default

    # ── Traffic context (simulation ↔ TomTom live) + per-hub shift ────────────
    # `resolve` picks the effective factor + source (static / simulation / tomtom).
    # When TomTom is selected and a key is available, a traffic-aware travel-time
    # matrix drives the per-segment times; the scalar factor is the per-edge fallback.
    ctx            = resolve_traffic(sys_str)
    tomtom_key     = tomtom.resolve_key(sys_str.get("tomtom_api_key"))
    use_tomtom     = ctx["enabled"] and ctx["mode"] == "tomtom" and tomtom_key is not None
    peak_intensity = ctx["peak_intensity"]
    static_tf      = ctx["static_factor"]
    g_shift_start  = _cf("shift_start", 8.0)
    g_shift_hours  = _cf("shift_hours", 8.0)

    base_opt = {
        "weight_cost": _cf("opt_weight_cost", 0.40),
        "weight_time": _cf("opt_weight_time", 0.35),
        "weight_env":  _cf("opt_weight_env",  0.25),
        "co2_shadow":  _cf("co2_shadow_chf",  0.12),
    }
    require_full_delivery = _cf("require_full_delivery", 0.0) >= 0.5

    # Optimisation weights now drive the last-mile vehicle choice (eco→low-CO₂,
    # cost→cheapest, time→fastest deployed first). Backbone stays capacity-first.
    last_mile_veh = _weighted_vehicle_order(last_mile_veh, base_opt)

    def _hub_opt(h: dict) -> dict:
        """Per-hub optimisation context — each city its own shift + traffic factor.
        Simulation → per-hub shift-averaged factor; TomTom/static → the global
        resolved factor (per-segment times come from the TomTom matrix anyway)."""
        s_start = h.get("shift_start") or g_shift_start
        s_hours = h.get("shift_hours") or g_shift_hours
        if ctx["source"] == "simulation":
            tf = effective_factor(enabled=True, static_factor=static_tf,
                                  shift_start=s_start, shift_hours=s_hours,
                                  peak_intensity=peak_intensity)
        else:
            tf = ctx["effective_factor"]
        return {**base_opt, "shift_start": s_start, "shift_hours": s_hours,
                "traffic_factor": tf,
                "fallback_source": "tomtom_error" if use_tomtom else ctx["source"]}

    logger.info(
        f"[Step 4] Last-mile fleet: {[v['name'] for v in last_mile_veh]} | "
        f"Backbone fleet: {[v['name'] for v in backbone_veh]} | "
        f"Verkehr: {ctx['source']} (mode={ctx['mode']}, enabled={ctx['enabled']}, "
        f"×{ctx['effective_factor']}, TomTom-Matrix={'AN' if use_tomtom else 'AUS'})"
    )

    # ── Prepare data — extract ALL ORM fields into plain dicts BEFORE threads ──
    pharmacies = {p.id: p for p in db.query(Pharmacy).all()}
    # Hub plain dicts — safe for cross-thread access (no lazy-loading possible)
    hub_dicts: dict[str, dict] = {
        h.name: {
            "name":        h.name,
            "hub_type":    h.hub_type,
            "lat":         float(h.lat),
            "lon":         float(h.lon),
            "parent_hub":  h.parent_hub,
            "open_hour":   float(h.open_hour  or 0.0),
            "close_hour":  float(h.close_hour or 24.0),
            "shift_start": float(h.shift_start) if h.shift_start is not None else None,
            "shift_hours": float(h.shift_hours) if h.shift_hours is not None else None,
        }
        for h in db.query(Hub).all()
    }
    assignments = db.query(Assignment).all()

    # Build hub_stops FIRST — needed to decide which hubs are active
    hub_stops:  dict[str, list[dict]] = defaultdict(list)
    hub_demand: dict[str, int]        = defaultdict(int)
    for a in assignments:
        p = pharmacies.get(a.pharmacy_id)
        if p:
            d = int(p.demand or 1)
            hub_stops[a.hub_name].append({
                "id": p.id, "lat": float(p.lat), "lon": float(p.lon), "demand": d,
                "open_hour":  float(p.open_hour  or 0.0),
                "close_hour": float(p.close_hour or 24.0),
            })
            hub_demand[a.hub_name] += d

    # Include HQ in last-mile if it has directly-assigned pharmacies
    # (happens when pharmacy is within hq_direct_radius_km configured in Step 3)
    delivery_hub_dicts = {
        n: d for n, d in hub_dicts.items()
        if d["hub_type"] != "HQ" or hub_stops.get(n)
    }

    db.query(VehicleRoute).delete()
    db.commit()

    # ── Last-mile routing (parallel per hub) ──────────────────────────────────
    logger.info(f"[Step 4] Last-mile: routing {len(delivery_hub_dicts)} hubs…")
    all_routes: list[dict] = []
    unrouted_by_hub: dict[str, list[dict]] = {}

    def _process(hub_name: str):
        h = delivery_hub_dicts[hub_name]   # plain dict — fully thread-safe
        return hub_name, _solve_vrp(hub_name, h["lat"], h["lon"],
                                    hub_stops.get(hub_name, []), last_mile_veh, _hub_opt(h),
                                    use_tomtom=use_tomtom, tomtom_key=tomtom_key)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_process, n) for n in delivery_hub_dicts]
        for fut in as_completed(futures):
            hub_name, (routes, unrouted) = fut.result()
            all_routes.extend(routes)
            if unrouted:
                unrouted_by_hub[hub_name] = unrouted

    # ── Forced delivery pass (optional) — "alle Apotheken beliefern" ──────────
    # Routes every still-unrouted stop with the most-capable last-mile vehicle,
    # ignoring shift/opening-hours limits so nothing is left behind.
    if require_full_delivery and unrouted_by_hub:
        force_veh = max(last_mile_veh, key=lambda v: (v["capacity"] or 10_000_000, v["range_km"]))
        forced_total = 0
        for hub_name, leftovers in unrouted_by_hub.items():
            h = delivery_hub_dicts[hub_name]
            forced = _force_route(hub_name, h["lat"], h["lon"], leftovers, force_veh, _hub_opt(h))
            all_routes.extend(forced)
            forced_total += sum(len(r["stops"]) for r in forced)
        unrouted_by_hub = {}   # all served now
        logger.info(f"[Step 4] Zwangslieferung: {forced_total} Apotheken garantiert beliefert "
                    f"({force_veh['name']}, Schicht-/Öffnungszeit-Grenzen ignoriert)")

    db.bulk_save_objects([_route_obj(r, "last_mile") for r in all_routes])
    db.commit()

    # ── Persist per-pharmacy undeliverable reason (None = delivered) ──────────
    reason_by_id = {s["id"]: s.get("reason") for stops in unrouted_by_hub.values() for s in stops}
    for p in db.query(Pharmacy).all():
        p.undeliverable_reason = reason_by_id.get(p.id)
    db.commit()

    # ── Backbone routing (single thread, plain dicts) ─────────────────────────
    logger.info("[Step 4] Backbone: HQ → VZ and VZ → mVZ…")
    hq_d     = next((d for d in hub_dicts.values() if d["hub_type"] == "HQ"), None)
    vz_list  = [d for d in hub_dicts.values() if d["hub_type"] == "VZ"]
    mvz_list = [d for d in hub_dicts.values() if d["hub_type"] == "mVZ"]
    backbone_routes: list[dict] = []

    if hq_d and backbone_veh:
        # Goods volume that must reach each VZ = its own pharmacies + its child mVZs
        vz_total: dict[str, int] = {}
        for vz in vz_list:
            child = sum(hub_demand.get(m["name"], 0) for m in mvz_list if m["parent_hub"] == vz["name"])
            vz_total[vz["name"]] = hub_demand.get(vz["name"], 0) + child

        # HQ → all VZs (multi-stop tour)
        hq_stops = [
            {"id": vz["name"], "lat": vz["lat"], "lon": vz["lon"],
             "demand": max(1, vz_total.get(vz["name"], 0))}
            for vz in vz_list
        ]
        backbone_routes.extend(
            _solve_vrp(hq_d["name"], hq_d["lat"], hq_d["lon"], hq_stops, backbone_veh, _hub_opt(hq_d),
                       use_tomtom=use_tomtom, tomtom_key=tomtom_key)[0]
        )

        # Each VZ → its child mVZs (multi-stop tour)
        for vz in vz_list:
            children = [m for m in mvz_list if m["parent_hub"] == vz["name"]]
            if not children:
                continue
            mvz_stops = [
                {"id": m["name"], "lat": m["lat"], "lon": m["lon"],
                 "demand": max(1, hub_demand.get(m["name"], 0))}
                for m in children
            ]
            backbone_routes.extend(
                _solve_vrp(vz["name"], vz["lat"], vz["lon"], mvz_stops, backbone_veh, _hub_opt(vz),
                           use_tomtom=use_tomtom, tomtom_key=tomtom_key)[0]
            )

    db.bulk_save_objects([_route_obj(r, "backbone") for r in backbone_routes])
    db.commit()

    # ── Surface TomTom problems from this run (live mode) for a UI popup ───────
    if use_tomtom:
        errs = [r.get("traffic_error") for r in (all_routes + backbone_routes) if r.get("traffic_error")]
        last_err = errs[0] if errs else ""
    else:
        last_err = ""
    _row = db.query(SystemConfig).filter(SystemConfig.key == "tomtom_last_error").first()
    if _row:
        _row.value = last_err
    else:
        db.add(SystemConfig(key="tomtom_last_error", value=last_err))
    db.commit()

    tk = sum(r["total_km"] for r in all_routes)
    tc = sum(r["total_cost_chf"] for r in all_routes)
    tco2 = sum(r["co2_kg"] for r in all_routes)
    logger.info(
        f"[Step 4] Done — {len(all_routes)} last-mile + {len(backbone_routes)} backbone | "
        f"{tk:.0f} km | CHF {tc:.0f} | {tco2:.0f} kg CO₂"
    )


def _route_obj(r: dict, tier: str) -> VehicleRoute:
    return VehicleRoute(
        hub_name=r["hub_name"], vehicle_id=r["vehicle_id"], vehicle_type=r["vehicle_type"],
        stops=r["stops"], stop_coords=r["stop_coords"],
        total_km=r["total_km"], total_hours=r["total_hours"],
        total_items=r["total_items"], total_cost_chf=r["total_cost_chf"],
        co2_kg=r["co2_kg"], restock_count=r["restock_count"], supply_tier=tier,
        traffic_factor=r.get("traffic_factor"), traffic_source=r.get("traffic_source"),
        free_flow_hours=r.get("free_flow_hours"), forced=bool(r.get("forced", False)),
    )
