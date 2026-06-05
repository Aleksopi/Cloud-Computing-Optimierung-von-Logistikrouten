"""
Step 4 — Last-Mile Route Optimisation
Vehicle fleet and all parameters are loaded from DB at runtime (fully configurable).
Multi-objective greedy VRP: minimises weighted cost + time + CO₂.
Each hub solved in parallel. Backbone supply-chain routes appended afterwards.
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


def _composite_score(
    d_km: float,
    cost_per_km: float,
    co2_g_per_km: float,
    speed_kmh: float,
    driver_chf_h: float,
    service_min: float,
    opt_cost: float,
    opt_time: float,
    opt_env: float,
    traffic_factor: float,
    co2_shadow_chf: float,
) -> float:
    """Unified stop-selection score (lower = better).
    Blends direct vehicle cost, driver-time cost, and monetised CO₂.
    traffic_factor > 1.0 increases time cost, simulating congestion.
    """
    drive_h   = (d_km / speed_kmh) * traffic_factor
    cost      = d_km * cost_per_km
    time_cost = (drive_h + service_min / 60.0) * driver_chf_h
    co2_cost  = (d_km * co2_g_per_km / 1000.0) * co2_shadow_chf
    return opt_cost * cost + opt_time * time_cost + opt_env * co2_cost


# ── VRP solver ────────────────────────────────────────────────────────────────

def _solve_hub(
    hub_name: str,
    hub_lat: float,
    hub_lon: float,
    stops: list[dict],
    delivery_vehicles: list[dict],   # plain dicts — thread-safe
    opt: dict,                        # optimisation params
) -> list[dict]:
    """Greedy nearest-neighbour VRP.  Iterates delivery vehicles in sort_order.
    Each vehicle type contributes up to max_per_hub vehicles before the next type."""
    routes: list[dict] = []
    remaining = list(stops)

    for vconf in delivery_vehicles:
        if not remaining:
            break

        cap         = vconf["capacity"]          # None = unlimited
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

            vehicle_id  = f"{hub_name}_{vname}_{vnum}"
            route_stops: list[int] = []
            stop_coords: list[list[float]] = [[hub_lon, hub_lat]]
            items_loaded = cap if cap else 10_000_000
            km_used      = 0.0
            hours_used   = 0.0
            total_items  = 0
            total_co2_g  = 0.0
            restock_done = 0
            cur_lat, cur_lon = hub_lat, hub_lon

            while remaining:
                best_idx, best_score, best_d = None, np.inf, 0.0
                for idx, stop in enumerate(remaining):
                    if stop["demand"] > items_loaded:
                        continue
                    d_to   = _hav(cur_lat, cur_lon, stop["lat"], stop["lon"])
                    d_back = _hav(stop["lat"], stop["lon"], hub_lat, hub_lon)
                    if km_used + d_to + d_back > range_km:
                        continue
                    drive_h = (d_to / speed) * opt["traffic_factor"]
                    if hours_used + drive_h + svc_min / 60.0 > opt["shift_hours"]:
                        continue
                    score = _composite_score(
                        d_to, cost_km, co2_g_km, speed, driver_h, svc_min,
                        opt["weight_cost"], opt["weight_time"], opt["weight_env"],
                        opt["traffic_factor"], opt["co2_shadow"],
                    )
                    if score < best_score:
                        best_score, best_idx, best_d = score, idx, d_to

                if best_idx is None:
                    # Try capacity restock if that's the bottleneck
                    if (cap is not None
                            and restock_done == 0
                            and items_loaded < restock_thr):
                        d_r = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
                        km_used     += d_r
                        total_co2_g += d_r * co2_g_km
                        hours_used  += (d_r / speed) * opt["traffic_factor"]
                        cur_lat, cur_lon = hub_lat, hub_lon
                        items_loaded = cap
                        restock_done += 1
                        continue
                    break

                stop = remaining.pop(best_idx)
                route_stops.append(stop["pharmacy_id"])
                stop_coords.append([stop["lon"], stop["lat"]])
                items_loaded -= stop["demand"]
                total_items  += stop["demand"]
                drive_h       = (best_d / speed) * opt["traffic_factor"]
                km_used      += best_d
                total_co2_g  += best_d * co2_g_km
                hours_used   += drive_h + svc_min / 60.0
                cur_lat, cur_lon = stop["lat"], stop["lon"]

            if route_stops:
                d_ret        = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
                km_used     += d_ret
                total_co2_g += d_ret * co2_g_km
                stop_coords.append([hub_lon, hub_lat])
                total_cost = round(km_used * cost_km + hours_used * driver_h, 2)
                routes.append(dict(
                    hub_name=hub_name,
                    vehicle_id=vehicle_id,
                    vehicle_type=vname,
                    stops=route_stops,
                    stop_coords=_road_geometry(stop_coords),
                    total_km=round(km_used, 2),
                    total_hours=round(hours_used, 2),
                    total_items=total_items,
                    total_cost_chf=total_cost,
                    co2_kg=round(total_co2_g / 1000.0, 3),
                    restock_count=restock_done,
                ))

    if remaining:
        logger.warning(f"[Step 4] {hub_name}: {len(remaining)} stops unrouted (capacity/range exceeded)")

    return routes


# ── Orchestrator ──────────────────────────────────────────────────────────────

def run_routes(db) -> None:
    # ── Load vehicle fleet from DB ────────────────────────────────────────────
    delivery_veh = (
        db.query(VehicleFleetConfig)
        .filter(VehicleFleetConfig.vehicle_class == "delivery",
                VehicleFleetConfig.enabled == True)  # noqa: E712
        .order_by(VehicleFleetConfig.sort_order)
        .all()
    )
    backbone_cfg = (
        db.query(VehicleFleetConfig)
        .filter(VehicleFleetConfig.vehicle_class == "backbone",
                VehicleFleetConfig.enabled == True)  # noqa: E712
        .first()
    )

    # Convert to plain dicts (thread-safe)
    delivery_dicts = [
        dict(
            name=v.name,
            capacity=v.capacity,
            range_km=v.range_km,
            cost_per_km=v.cost_per_km,
            co2_g_per_km=v.co2_g_per_km,
            speed_kmh=v.speed_kmh,
            driver_chf_h=float(v.driver_chf_h or 0),
            service_min=int(v.service_min or 20),
            max_per_hub=int(v.max_per_hub or 10),
            restock_threshold=int(v.restock_threshold or 5),
        )
        for v in delivery_veh
    ]

    # ── Load system config ────────────────────────────────────────────────────
    sys_raw = {c.key: float(c.value) for c in db.query(SystemConfig).all()}
    opt = {
        "shift_hours":    sys_raw.get("shift_hours",      8.0),
        "weight_cost":    sys_raw.get("opt_weight_cost",  0.40),
        "weight_time":    sys_raw.get("opt_weight_time",  0.35),
        "weight_env":     sys_raw.get("opt_weight_env",   0.25),
        "traffic_factor": sys_raw.get("traffic_factor",   1.0),
        "co2_shadow":     sys_raw.get("co2_shadow_chf",   0.12),
    }

    logger.info(
        f"[Step 4] Fleet: {[d['name'] for d in delivery_dicts]} | "
        f"Backbone: {backbone_cfg.name if backbone_cfg else 'none'} | "
        f"Weights cost={opt['weight_cost']} time={opt['weight_time']} env={opt['weight_env']}"
    )

    # ── Prepare stops ─────────────────────────────────────────────────────────
    pharmacies = {p.id: p for p in db.query(Pharmacy).all()}
    hubs: dict[str, dict] = {
        h.name: {"lat": float(h.lat), "lon": float(h.lon)}
        for h in db.query(Hub).filter(Hub.hub_type != "HQ").all()
    }
    assignments = db.query(Assignment).all()

    hub_stops:  dict[str, list[dict]] = defaultdict(list)
    hub_demand: dict[str, int]        = defaultdict(int)
    for a in assignments:
        p = pharmacies.get(a.pharmacy_id)
        if p:
            demand = int(p.demand or 1)
            hub_stops[a.hub_name].append(
                {"pharmacy_id": p.id, "lat": float(p.lat), "lon": float(p.lon), "demand": demand}
            )
            hub_demand[a.hub_name] += demand

    db.query(VehicleRoute).delete()
    db.commit()

    # ── Parallel last-mile routing ────────────────────────────────────────────
    logger.info(f"[Step 4] Routing {len(hubs)} hubs in parallel…")
    all_routes: list[dict] = []

    def _process(hub_name: str):
        hub = hubs[hub_name]
        stops = hub_stops.get(hub_name, [])
        logger.info(f"  {hub_name}: {len(stops)} stops")
        return _solve_hub(hub_name, hub["lat"], hub["lon"], stops, delivery_dicts, opt)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_process, name) for name in hubs]
        for fut in as_completed(futures):
            all_routes.extend(fut.result())

    route_objs = [
        VehicleRoute(
            hub_name=r["hub_name"], vehicle_id=r["vehicle_id"], vehicle_type=r["vehicle_type"],
            stops=r["stops"], stop_coords=r["stop_coords"],
            total_km=r["total_km"], total_hours=r["total_hours"],
            total_items=r["total_items"], total_cost_chf=r["total_cost_chf"],
            co2_kg=r["co2_kg"], restock_count=r["restock_count"],
            supply_tier="last_mile",
        )
        for r in all_routes
    ]
    db.bulk_save_objects(route_objs)
    db.commit()

    # ── Backbone supply-chain routes (HQ → VZ → mVZ) ─────────────────────────
    logger.info("[Step 4] Computing backbone supply-chain routes…")
    hq_obj  = db.query(Hub).filter(Hub.hub_type == "HQ").first()
    all_vz  = db.query(Hub).filter(Hub.hub_type == "VZ").all()
    all_mvz = db.query(Hub).filter(Hub.hub_type == "mVZ").all()
    backbone_objs: list[VehicleRoute] = []

    bb_cost_km  = backbone_cfg.cost_per_km  if backbone_cfg else 2.50
    bb_co2_km   = backbone_cfg.co2_g_per_km if backbone_cfg else 450.0
    bb_speed    = backbone_cfg.speed_kmh    if backbone_cfg else 85.0
    bb_name     = backbone_cfg.name         if backbone_cfg else "Backbone"

    if hq_obj:
        for vz in all_vz:
            total_items = hub_demand.get(vz.name, 0) + sum(
                hub_demand.get(m.name, 0) for m in all_mvz if m.parent_hub == vz.name
            )
            km    = _hav(hq_obj.lat, hq_obj.lon, vz.lat, vz.lon)
            backbone_objs.append(VehicleRoute(
                hub_name=hq_obj.name,
                vehicle_id=f"Backbone_HQ→{vz.name}",
                vehicle_type=bb_name,
                stops=[], stop_coords=_road_geometry([[hq_obj.lon, hq_obj.lat], [vz.lon, vz.lat]]),
                total_km=round(km, 2), total_hours=round(km / bb_speed, 2),
                total_items=total_items,
                total_cost_chf=round(km * bb_cost_km, 2),
                co2_kg=round(km * bb_co2_km / 1000.0, 3),
                restock_count=0, supply_tier="backbone",
            ))
            logger.info(f"  HQ → {vz.name}: {km:.0f} km, {total_items} items")

        for mvz in all_mvz:
            parent = next((v for v in all_vz if v.name == mvz.parent_hub), None)
            if not parent:
                continue
            km = _hav(parent.lat, parent.lon, mvz.lat, mvz.lon)
            backbone_objs.append(VehicleRoute(
                hub_name=parent.name,
                vehicle_id=f"Backbone_{parent.name}→{mvz.name}",
                vehicle_type=bb_name,
                stops=[], stop_coords=_road_geometry([[parent.lon, parent.lat], [mvz.lon, mvz.lat]]),
                total_km=round(km, 2), total_hours=round(km / bb_speed, 2),
                total_items=hub_demand.get(mvz.name, 0),
                total_cost_chf=round(km * bb_cost_km, 2),
                co2_kg=round(km * bb_co2_km / 1000.0, 3),
                restock_count=0, supply_tier="backbone",
            ))

    db.bulk_save_objects(backbone_objs)
    db.commit()

    total_km  = sum(r["total_km"]       for r in all_routes)
    total_cost = sum(r["total_cost_chf"] for r in all_routes)
    total_co2  = sum(r["co2_kg"]         for r in all_routes)
    logger.info(
        f"[Step 4] Done — {len(route_objs)} last-mile + {len(backbone_objs)} backbone | "
        f"{total_km:.0f} km | CHF {total_cost:.0f} | {total_co2:.0f} kg CO₂"
    )
