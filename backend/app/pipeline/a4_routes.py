"""
Step 4 — Route Optimisation (last-mile + backbone)
Fully DB-driven, multi-objective greedy VRP (cost + time + CO₂).

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


def _hav(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = (np.sin(dlat / 2) ** 2
         + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2)
    return float(R * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0))))


def _composite_score(d_km, cost_per_km, co2_g_per_km, speed_kmh, driver_chf_h, service_min, opt):
    """Unified stop-selection score (lower = better): cost + time + monetised CO₂."""
    drive_h   = (d_km / speed_kmh) * opt["traffic_factor"]
    cost      = d_km * cost_per_km
    time_cost = (drive_h + service_min / 60.0) * driver_chf_h
    co2_cost  = (d_km * co2_g_per_km / 1000.0) * opt["co2_shadow"]
    return opt["weight_cost"] * cost + opt["weight_time"] * time_cost + opt["weight_env"] * co2_cost


# ── Generalised multi-stop VRP solver ──────────────────────────────────────────

def _solve_vrp(
    depot_name: str,
    depot_lat: float,
    depot_lon: float,
    stops: list[dict],          # [{id, lat, lon, demand}, ...]
    vehicles: list[dict],       # plain dicts, in deployment order
    opt: dict,
) -> list[dict]:
    """Greedy nearest-neighbour VRP. Deploys each vehicle type up to max_per_hub.
    Each vehicle drives a multi-stop tour minimising the composite score."""
    routes: list[dict] = []
    remaining = list(stops)

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
            total_items  = 0
            restock_done = 0
            cur_lat, cur_lon = depot_lat, depot_lon

            while remaining:
                best_idx, best_score, best_d = None, np.inf, 0.0
                for idx, stop in enumerate(remaining):
                    if stop["demand"] > items_loaded:
                        continue
                    d_to   = _hav(cur_lat, cur_lon, stop["lat"], stop["lon"])
                    d_back = _hav(stop["lat"], stop["lon"], depot_lat, depot_lon)
                    if km_used + d_to + d_back > range_km:
                        continue
                    drive_h = (d_to / speed) * opt["traffic_factor"]
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
                    score = _composite_score(d_to, cost_km, co2_g_km, speed, driver_h, svc_min, opt)
                    if score < best_score:
                        best_score, best_idx, best_d = score, idx, d_to

                if best_idx is None:
                    break

                stop = remaining.pop(best_idx)
                route_ids.append(stop["id"])
                stop_coords.append([stop["lon"], stop["lat"]])
                items_loaded -= stop["demand"]
                total_items  += stop["demand"]
                drive_h       = (best_d / speed) * opt["traffic_factor"]
                km_used      += best_d
                total_co2_g  += best_d * co2_g_km
                hours_used   += drive_h + svc_min / 60.0
                cur_lat, cur_lon = stop["lat"], stop["lon"]

            if route_ids:
                d_ret        = _hav(cur_lat, cur_lon, depot_lat, depot_lon)
                km_used     += d_ret
                total_co2_g += d_ret * co2_g_km
                stop_coords.append([depot_lon, depot_lat])
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
                ))

    if remaining:
        logger.warning(f"[Step 4] {depot_name}: {len(remaining)} stops unrouted (capacity/range)")
    return routes


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

    sys_raw = {c.key: float(c.value) for c in db.query(SystemConfig).all()}
    opt = {
        "shift_hours":    sys_raw.get("shift_hours",     8.0),
        "shift_start":    sys_raw.get("shift_start",     8.0),
        "weight_cost":    sys_raw.get("opt_weight_cost", 0.40),
        "weight_time":    sys_raw.get("opt_weight_time", 0.35),
        "weight_env":     sys_raw.get("opt_weight_env",  0.25),
        "traffic_factor": sys_raw.get("traffic_factor",  1.0),
        "co2_shadow":     sys_raw.get("co2_shadow_chf",  0.12),
    }
    logger.info(
        f"[Step 4] Last-mile fleet: {[v['name'] for v in last_mile_veh]} | "
        f"Backbone fleet: {[v['name'] for v in backbone_veh]}"
    )

    # ── Prepare data — extract ALL ORM fields into plain dicts BEFORE threads ──
    pharmacies = {p.id: p for p in db.query(Pharmacy).all()}
    # Hub plain dicts — safe for cross-thread access (no lazy-loading possible)
    hub_dicts: dict[str, dict] = {
        h.name: {
            "name":       h.name,
            "hub_type":   h.hub_type,
            "lat":        float(h.lat),
            "lon":        float(h.lon),
            "parent_hub": h.parent_hub,
            "open_hour":  float(h.open_hour  or 0.0),
            "close_hour": float(h.close_hour or 24.0),
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

    def _process(hub_name: str):
        h = delivery_hub_dicts[hub_name]   # plain dict — fully thread-safe
        return _solve_vrp(hub_name, h["lat"], h["lon"],
                          hub_stops.get(hub_name, []), last_mile_veh, opt)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_process, n) for n in delivery_hub_dicts]
        for fut in as_completed(futures):
            all_routes.extend(fut.result())

    db.bulk_save_objects([_route_obj(r, "last_mile") for r in all_routes])
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
            _solve_vrp(hq_d["name"], hq_d["lat"], hq_d["lon"], hq_stops, backbone_veh, opt)
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
                _solve_vrp(vz["name"], vz["lat"], vz["lon"], mvz_stops, backbone_veh, opt)
            )

    db.bulk_save_objects([_route_obj(r, "backbone") for r in backbone_routes])
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
    )
