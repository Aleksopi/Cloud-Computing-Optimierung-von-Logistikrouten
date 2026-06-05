"""
Step 4 — Last-Mile Route Optimisation
Multi-objective greedy VRP: minimises weighted combination of cost, time and CO2.
Each hub solved in parallel. Backbone supply-chain routes computed afterwards.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import requests as _http

from app.config import settings
from app.db.models import Assignment, Hub, Pharmacy, VehicleRoute

logger = logging.getLogger(__name__)

# ── EVan specs  (Mercedes eSprinter / electric light van) ─────────────────────
EVAN_CAPACITY        = 30       # delivery units per load
EVAN_RANGE_KM        = 200.0    # single-charge practical range (km)
EVAN_SERVICE_MIN     = 20       # stop service time (min)
EVAN_MAX_PER_HUB     = 12       # max EVans deployed per hub
EVAN_RESTOCK_THRESH  = 10       # restock items threshold
EVAN_COST_PER_KM     = 0.28     # CHF/km  (electricity + leasing + maintenance)
EVAN_CO2_G_PER_KM    = 35.0     # g CO2/km (Swiss electricity mix ≈ 150 gCO2/kWh)
EVAN_SPEED_KMH       = 65.0     # avg urban delivery speed
EVAN_DRIVER_CHF_H    = 45.0     # driver wage CHF/h

# ── LKW specs  (7.5 t diesel delivery truck) ──────────────────────────────────
LKW_CAPACITY         = 200      # delivery units per load
LKW_RANGE_KM         = 500.0    # range per shift (km)
LKW_SERVICE_MIN      = 35       # stop service time (min)
LKW_MAX_PER_HUB      = 3
LKW_COST_PER_KM      = 1.20     # CHF/km  (diesel + driver + tolls + depreciation)
LKW_CO2_G_PER_KM     = 280.0    # g CO2/km
LKW_SPEED_KMH        = 75.0     # avg delivery speed
LKW_DRIVER_CHF_H     = 55.0     # driver wage CHF/h

# ── Backbone truck  (20 t semi for hub replenishment) ─────────────────────────
BACKBONE_COST_PER_KM  = 2.50    # CHF/km
BACKBONE_CO2_G_PER_KM = 450.0   # g CO2/km
BACKBONE_SPEED_KMH    = 85.0    # highway speed

# ── Shared ────────────────────────────────────────────────────────────────────
SHIFT_HOURS = 8.0

# ── Multi-objective optimisation weights (sum = 1.0) ─────────────────────────
OPT_WEIGHT_COST = 0.40   # minimise direct vehicle cost (CHF)
OPT_WEIGHT_TIME = 0.35   # minimise driver time (h)
OPT_WEIGHT_ENV  = 0.25   # minimise CO2 emissions

# Traffic multiplier — 1.0 = free-flow; plug in live-traffic factor here later
TRAFFIC_FACTOR = 1.0

# Shadow price: convert CO2 into CHF for the unified scoring function
CO2_SHADOW_CHF_PER_KG = 0.12   # CHF/kg CO2 (Swiss voluntary CO2 levy proxy)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _road_geometry(waypoints: list[list[float]]) -> list[list[float]]:
    """OSRM /route → real road geometry. Falls back to straight lines on error."""
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
) -> float:
    """Unified stop-selection score (lower = better).
    Blends direct cost, driver-time cost, and monetised CO2 via configurable weights.
    Includes TRAFFIC_FACTOR to allow future live-traffic adjustment.
    """
    drive_h      = (d_km / speed_kmh) * TRAFFIC_FACTOR
    cost_chf     = d_km * cost_per_km
    time_cost    = (drive_h + service_min / 60.0) * driver_chf_h
    co2_cost     = (d_km * co2_g_per_km / 1000.0) * CO2_SHADOW_CHF_PER_KG
    return (OPT_WEIGHT_COST * cost_chf
            + OPT_WEIGHT_TIME * time_cost
            + OPT_WEIGHT_ENV  * co2_cost)


# ── Core VRP solver ───────────────────────────────────────────────────────────

def _solve_hub(hub_name: str, hub_lat: float, hub_lon: float, stops: list[dict]) -> list[dict]:
    """Greedy nearest-neighbour VRP with multi-objective stop selection.

    stops: [{pharmacy_id, lat, lon, demand}, ...]
    Returns list of route dicts (one per vehicle deployed).
    """
    routes: list[dict] = []
    remaining = list(stops)

    # ── EVan fleet ────────────────────────────────────────────────────────────
    for evan_num in range(1, EVAN_MAX_PER_HUB + 1):
        if not remaining:
            break
        vehicle_id  = f"{hub_name}_EVan_{evan_num}"
        route_stops: list[int] = []
        stop_coords: list[list[float]] = [[hub_lon, hub_lat]]
        items_loaded = EVAN_CAPACITY
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
                if km_used + d_to + d_back > EVAN_RANGE_KM:
                    continue
                drive_h = (d_to / EVAN_SPEED_KMH) * TRAFFIC_FACTOR
                if hours_used + drive_h + EVAN_SERVICE_MIN / 60.0 > SHIFT_HOURS:
                    continue
                score = _composite_score(
                    d_to, EVAN_COST_PER_KM, EVAN_CO2_G_PER_KM,
                    EVAN_SPEED_KMH, EVAN_DRIVER_CHF_H, EVAN_SERVICE_MIN,
                )
                if score < best_score:
                    best_score, best_idx, best_d = score, idx, d_to

            if best_idx is None:
                if restock_done == 0 and items_loaded < EVAN_RESTOCK_THRESH:
                    d_back = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
                    km_used     += d_back
                    total_co2_g += d_back * EVAN_CO2_G_PER_KM
                    hours_used  += (d_back / EVAN_SPEED_KMH) * TRAFFIC_FACTOR
                    cur_lat, cur_lon = hub_lat, hub_lon
                    items_loaded = EVAN_CAPACITY
                    restock_done += 1
                    continue
                break

            stop = remaining.pop(best_idx)
            route_stops.append(stop["pharmacy_id"])
            stop_coords.append([stop["lon"], stop["lat"]])
            items_loaded -= stop["demand"]
            total_items  += stop["demand"]
            drive_h       = (best_d / EVAN_SPEED_KMH) * TRAFFIC_FACTOR
            km_used      += best_d
            total_co2_g  += best_d * EVAN_CO2_G_PER_KM
            hours_used   += drive_h + EVAN_SERVICE_MIN / 60.0
            cur_lat, cur_lon = stop["lat"], stop["lon"]

        if route_stops:
            d_ret        = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
            km_used     += d_ret
            total_co2_g += d_ret * EVAN_CO2_G_PER_KM
            stop_coords.append([hub_lon, hub_lat])
            total_cost = round(km_used * EVAN_COST_PER_KM + hours_used * EVAN_DRIVER_CHF_H, 2)
            routes.append(dict(
                hub_name=hub_name,
                vehicle_id=vehicle_id,
                vehicle_type="EVan",
                stops=route_stops,
                stop_coords=_road_geometry(stop_coords),
                total_km=round(km_used, 2),
                total_hours=round(hours_used, 2),
                total_items=total_items,
                total_cost_chf=total_cost,
                co2_kg=round(total_co2_g / 1000.0, 3),
                restock_count=restock_done,
            ))

    # ── LKW fleet (overflow) ──────────────────────────────────────────────────
    for lkw_num in range(1, LKW_MAX_PER_HUB + 1):
        if not remaining:
            break
        vehicle_id  = f"{hub_name}_LKW_{lkw_num}"
        route_stops = []
        stop_coords = [[hub_lon, hub_lat]]
        items_loaded = LKW_CAPACITY
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
                if km_used + d_to + d_back > LKW_RANGE_KM:
                    continue
                drive_h = (d_to / LKW_SPEED_KMH) * TRAFFIC_FACTOR
                if hours_used + drive_h + LKW_SERVICE_MIN / 60.0 > SHIFT_HOURS:
                    continue
                score = _composite_score(
                    d_to, LKW_COST_PER_KM, LKW_CO2_G_PER_KM,
                    LKW_SPEED_KMH, LKW_DRIVER_CHF_H, LKW_SERVICE_MIN,
                )
                if score < best_score:
                    best_score, best_idx, best_d = score, idx, d_to

            if best_idx is None:
                if items_loaded < max((s["demand"] for s in remaining), default=0):
                    d_back = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
                    km_used     += d_back
                    total_co2_g += d_back * LKW_CO2_G_PER_KM
                    hours_used  += (d_back / LKW_SPEED_KMH) * TRAFFIC_FACTOR
                    cur_lat, cur_lon = hub_lat, hub_lon
                    items_loaded = LKW_CAPACITY
                    restock_done += 1
                    continue
                break

            stop = remaining.pop(best_idx)
            route_stops.append(stop["pharmacy_id"])
            stop_coords.append([stop["lon"], stop["lat"]])
            items_loaded -= stop["demand"]
            total_items  += stop["demand"]
            drive_h       = (best_d / LKW_SPEED_KMH) * TRAFFIC_FACTOR
            km_used      += best_d
            total_co2_g  += best_d * LKW_CO2_G_PER_KM
            hours_used   += drive_h + LKW_SERVICE_MIN / 60.0
            cur_lat, cur_lon = stop["lat"], stop["lon"]

        if route_stops:
            d_ret        = _hav(cur_lat, cur_lon, hub_lat, hub_lon)
            km_used     += d_ret
            total_co2_g += d_ret * LKW_CO2_G_PER_KM
            stop_coords.append([hub_lon, hub_lat])
            total_cost = round(km_used * LKW_COST_PER_KM + hours_used * LKW_DRIVER_CHF_H, 2)
            routes.append(dict(
                hub_name=hub_name,
                vehicle_id=vehicle_id,
                vehicle_type="LKW",
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
        logger.warning(
            f"[Step 4] {hub_name}: {len(remaining)} stops unrouted (capacity/range exceeded)"
        )
    return routes


# ── Orchestrator ──────────────────────────────────────────────────────────────

def run_routes(db) -> None:
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

    logger.info(f"[Step 4] Routing {len(hubs)} hubs in parallel (multi-objective)…")
    all_routes: list[dict] = []

    def _process(hub_name: str):
        hub = hubs[hub_name]
        stops = hub_stops.get(hub_name, [])
        logger.info(f"  {hub_name}: {len(stops)} stops")
        return _solve_hub(hub_name, hub["lat"], hub["lon"], stops)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_process, name) for name in hubs]
        for fut in as_completed(futures):
            all_routes.extend(fut.result())

    route_objs = [
        VehicleRoute(
            hub_name=r["hub_name"],
            vehicle_id=r["vehicle_id"],
            vehicle_type=r["vehicle_type"],
            stops=r["stops"],
            stop_coords=r["stop_coords"],
            total_km=r["total_km"],
            total_hours=r["total_hours"],
            total_items=r["total_items"],
            total_cost_chf=r["total_cost_chf"],
            co2_kg=r["co2_kg"],
            restock_count=r["restock_count"],
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

    if hq_obj:
        # HQ → each VZ
        for vz in all_vz:
            total_items = hub_demand.get(vz.name, 0)
            for mvz in all_mvz:
                if mvz.parent_hub == vz.name:
                    total_items += hub_demand.get(mvz.name, 0)
            km    = _hav(hq_obj.lat, hq_obj.lon, vz.lat, vz.lon)
            co2_g = km * BACKBONE_CO2_G_PER_KM
            cost  = km * BACKBONE_COST_PER_KM
            backbone_objs.append(VehicleRoute(
                hub_name=hq_obj.name,
                vehicle_id=f"Backbone_HQ→{vz.name}",
                vehicle_type="Backbone",
                stops=[],
                stop_coords=_road_geometry([[hq_obj.lon, hq_obj.lat], [vz.lon, vz.lat]]),
                total_km=round(km, 2),
                total_hours=round(km / BACKBONE_SPEED_KMH, 2),
                total_items=total_items,
                total_cost_chf=round(cost, 2),
                co2_kg=round(co2_g / 1000.0, 3),
                restock_count=0,
                supply_tier="backbone",
            ))
            logger.info(f"  HQ → {vz.name}: {km:.0f} km, {total_items} items")

        # VZ → each mVZ
        for mvz in all_mvz:
            parent = next((v for v in all_vz if v.name == mvz.parent_hub), None)
            if not parent:
                continue
            total_items = hub_demand.get(mvz.name, 0)
            km    = _hav(parent.lat, parent.lon, mvz.lat, mvz.lon)
            co2_g = km * BACKBONE_CO2_G_PER_KM
            cost  = km * BACKBONE_COST_PER_KM
            backbone_objs.append(VehicleRoute(
                hub_name=parent.name,
                vehicle_id=f"Backbone_{parent.name}→{mvz.name}",
                vehicle_type="Backbone",
                stops=[],
                stop_coords=_road_geometry([[parent.lon, parent.lat], [mvz.lon, mvz.lat]]),
                total_km=round(km, 2),
                total_hours=round(km / BACKBONE_SPEED_KMH, 2),
                total_items=total_items,
                total_cost_chf=round(cost, 2),
                co2_kg=round(co2_g / 1000.0, 3),
                restock_count=0,
                supply_tier="backbone",
            ))

    db.bulk_save_objects(backbone_objs)
    db.commit()

    total_cost = sum(r["total_cost_chf"] for r in all_routes)
    total_km   = sum(r["total_km"]       for r in all_routes)
    total_co2  = sum(r["co2_kg"]         for r in all_routes)
    logger.info(
        f"[Step 4] Done — {len(route_objs)} last-mile + {len(backbone_objs)} backbone routes | "
        f"{total_km:.0f} km | CHF {total_cost:.0f} | {total_co2:.0f} kg CO2"
    )
