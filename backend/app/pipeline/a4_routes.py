"""
Step 4 — Last-Mile Route Optimisation
Greedy nearest-neighbour VRP with mixed EVan/LKW fleet.
Each hub is solved in parallel. Results written to PostgreSQL.
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

# ── Vehicle specs ─────────────────────────────────────────────────────────────
EVAN_CAPACITY = 30
EVAN_RANGE_KM = 150
EVAN_BOOST_KM = 80          # extra range on first trip (before restock)
EVAN_SERVICE_MIN = 30       # service time per stop in minutes
EVAN_MAX_PER_HUB = 12
EVAN_RESTOCK_THRESHOLD = 15 # restock when items_remaining < this
LKW_RANGE_KM = 600
LKW_SERVICE_MIN = 40
LKW_MAX_PER_HUB = 3
SHIFT_HOURS = 8.0
COST_PER_KM = 0.15          # CHF/km (flat rate, backbone costs omitted here)


def _road_geometry(waypoints: list[list[float]]) -> list[list[float]]:
    """Call OSRM /route to get actual road geometry for an ordered list of [lon, lat] waypoints.
    Falls back to the straight-line waypoints on any error."""
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
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    return float(R * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0))))


def _solve_hub(hub_name: str, hub_lat: float, hub_lon: float, stops: list[dict]) -> list[dict]:
    """
    stops: [{pharmacy_id, lat, lon, demand}, ...]
    Returns list of vehicle route dicts.
    """
    routes: list[dict] = []
    remaining = list(stops)

    # ── EVans ─────────────────────────────────────────────────────────────────
    for evan_num in range(1, EVAN_MAX_PER_HUB + 1):
        if not remaining:
            break
        vehicle_id = f"{hub_name}_EVan_{evan_num}"
        route_stops: list[int] = []
        stop_coords: list[list[float]] = [[hub_lon, hub_lat]]
        items_loaded = EVAN_CAPACITY
        km_used = 0.0
        hours_used = 0.0
        total_items = 0
        restock_done = False
        cur_lat, cur_lon = hub_lat, hub_lon

        while remaining:
            best_idx, best_dist = None, np.inf
            for idx, stop in enumerate(remaining):
                if stop["demand"] > items_loaded:
                    continue
                d_to = _hav(cur_lat, cur_lon, stop["lat"], stop["lon"])
                d_back = _hav(stop["lat"], stop["lon"], hub_lat, hub_lon)
                max_range = EVAN_RANGE_KM + (EVAN_BOOST_KM if not restock_done else 0)
                if km_used + d_to + d_back > max_range:
                    continue
                if hours_used + d_to / 60 + EVAN_SERVICE_MIN / 60 > SHIFT_HOURS:
                    continue
                if d_to < best_dist:
                    best_dist, best_idx = d_to, idx

            if best_idx is None:
                # Try restock
                if not restock_done and items_loaded < EVAN_RESTOCK_THRESHOLD:
                    km_used += _hav(cur_lat, cur_lon, hub_lat, hub_lon)
                    cur_lat, cur_lon = hub_lat, hub_lon
                    items_loaded = EVAN_CAPACITY
                    restock_done = True
                    continue
                break

            stop = remaining.pop(best_idx)
            route_stops.append(stop["pharmacy_id"])
            stop_coords.append([stop["lon"], stop["lat"]])
            items_loaded -= stop["demand"]
            total_items += stop["demand"]
            km_used += best_dist
            hours_used += best_dist / 60 + EVAN_SERVICE_MIN / 60
            cur_lat, cur_lon = stop["lat"], stop["lon"]

        if route_stops:
            km_used += _hav(cur_lat, cur_lon, hub_lat, hub_lon)
            stop_coords.append([hub_lon, hub_lat])
            routes.append(
                dict(
                    hub_name=hub_name,
                    vehicle_id=vehicle_id,
                    vehicle_type="EVan",
                    stops=route_stops,
                    stop_coords=_road_geometry(stop_coords),
                    total_km=round(km_used, 2),
                    total_hours=round(hours_used, 2),
                    total_items=total_items,
                    total_cost_chf=round(km_used * COST_PER_KM, 2),
                    restock_count=int(restock_done),
                )
            )

    # ── LKW for overflow ──────────────────────────────────────────────────────
    for lkw_num in range(1, LKW_MAX_PER_HUB + 1):
        if not remaining:
            break
        vehicle_id = f"{hub_name}_LKW_{lkw_num}"
        route_stops = []
        stop_coords = [[hub_lon, hub_lat]]
        km_used = 0.0
        hours_used = 0.0
        total_items = 0
        cur_lat, cur_lon = hub_lat, hub_lon

        while remaining:
            best_idx, best_dist = None, np.inf
            for idx, stop in enumerate(remaining):
                d_to = _hav(cur_lat, cur_lon, stop["lat"], stop["lon"])
                d_back = _hav(stop["lat"], stop["lon"], hub_lat, hub_lon)
                if km_used + d_to + d_back > LKW_RANGE_KM:
                    continue
                if hours_used + d_to / 60 + LKW_SERVICE_MIN / 60 > SHIFT_HOURS:
                    continue
                if d_to < best_dist:
                    best_dist, best_idx = d_to, idx

            if best_idx is None:
                break

            stop = remaining.pop(best_idx)
            route_stops.append(stop["pharmacy_id"])
            stop_coords.append([stop["lon"], stop["lat"]])
            total_items += stop["demand"]
            km_used += best_dist
            hours_used += best_dist / 60 + LKW_SERVICE_MIN / 60
            cur_lat, cur_lon = stop["lat"], stop["lon"]

        if route_stops:
            km_used += _hav(cur_lat, cur_lon, hub_lat, hub_lon)
            stop_coords.append([hub_lon, hub_lat])
            routes.append(
                dict(
                    hub_name=hub_name,
                    vehicle_id=vehicle_id,
                    vehicle_type="LKW",
                    stops=route_stops,
                    stop_coords=_road_geometry(stop_coords),
                    total_km=round(km_used, 2),
                    total_hours=round(hours_used, 2),
                    total_items=total_items,
                    total_cost_chf=round(km_used * COST_PER_KM, 2),
                    restock_count=0,
                )
            )

    if remaining:
        logger.warning(f"[Step 4] {hub_name}: {len(remaining)} stops could not be routed (capacity/range exceeded)")

    return routes


def run_routes(db) -> None:
    pharmacies = {p.id: p for p in db.query(Pharmacy).all()}
    # Extract to plain dicts BEFORE ThreadPoolExecutor — SQLAlchemy ORM objects
    # are session-bound and must not be accessed across threads.
    hubs: dict[str, dict] = {
        h.name: {"lat": float(h.lat), "lon": float(h.lon)}
        for h in db.query(Hub).filter(Hub.hub_type != "HQ").all()
    }
    assignments = db.query(Assignment).all()

    hub_stops: dict[str, list[dict]] = defaultdict(list)
    for a in assignments:
        p = pharmacies.get(a.pharmacy_id)
        if p:
            hub_stops[a.hub_name].append(
                {"pharmacy_id": p.id, "lat": float(p.lat), "lon": float(p.lon), "demand": int(p.demand or 1)}
            )

    db.query(VehicleRoute).delete()
    db.commit()

    logger.info(f"[Step 4] Routing {len(hubs)} hubs in parallel…")
    all_routes: list[dict] = []

    def _process(hub_name: str):
        hub = hubs[hub_name]  # plain dict — safe for threads
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
            restock_count=r["restock_count"],
        )
        for r in all_routes
    ]
    db.bulk_save_objects(route_objs)
    db.commit()

    total_cost = sum(r["total_cost_chf"] for r in all_routes)
    total_km = sum(r["total_km"] for r in all_routes)
    logger.info(
        f"[Step 4] Done — {len(route_objs)} vehicles, "
        f"{total_km:.0f} km total, CHF {total_cost:.0f}"
    )
