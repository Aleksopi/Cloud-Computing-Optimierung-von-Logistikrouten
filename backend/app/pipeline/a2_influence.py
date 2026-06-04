"""
Step 2 — Influence / Road-based Hub Assignment
Fetches a full OSRM distance+time matrix in one HTTP call,
then retrieves road geometry for each pharmacy→hub route.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

from app.db.models import Assignment, Hub, Pharmacy
from app.services.osrm import osrm_geometry, osrm_table

logger = logging.getLogger(__name__)


def run_influence(pharmacies: list[Pharmacy], hubs: list[Hub], db) -> None:
    if not hubs:
        raise ValueError("No hubs found — run Step 1 first")

    p_coords = [(p.lat, p.lon) for p in pharmacies]
    h_coords = [(h.lat, h.lon) for h in hubs]
    h_names = [h.name for h in hubs]
    n_p = len(pharmacies)

    logger.info(f"[Step 2] OSRM table: {n_p} pharmacies × {len(hubs)} hubs…")
    dist_km, time_h = osrm_table(p_coords, h_coords)

    best_hub_idx = np.argmin(time_h, axis=1)  # shape (n_p,)

    assignments_map: dict[int, tuple[str, float, float]] = {
        i: (h_names[int(best_hub_idx[i])], float(dist_km[i, best_hub_idx[i]]), float(time_h[i, best_hub_idx[i]]))
        for i in range(n_p)
    }

    logger.info(f"[Step 2] Fetching {n_p} road geometries (parallel)…")

    def _fetch(i: int):
        hub_name, dist, time = assignments_map[i]
        hub = next(h for h in hubs if h.name == hub_name)
        coords = osrm_geometry((hub.lat, hub.lon), p_coords[i])
        return i, hub_name, dist, time, coords

    results: dict[int, tuple] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch, i): i for i in range(n_p)}
        done = 0
        for fut in as_completed(futures):
            i, hub_name, dist, time, coords = fut.result()
            results[i] = (hub_name, dist, time, coords)
            done += 1
            if done % 50 == 0:
                logger.info(f"[Step 2]   {done}/{n_p} geometries fetched…")

    # Persist
    db.query(Assignment).delete()
    db.commit()

    assignment_objs = []
    for i, p in enumerate(pharmacies):
        hub_name, dist, time, coords = results[i]
        p.hub_name = hub_name
        assignment_objs.append(
            Assignment(
                pharmacy_id=p.id,
                hub_name=hub_name,
                distance_km=round(dist, 2),
                travel_time_h=round(time, 4),
                route_geometry=coords,
            )
        )

    db.bulk_save_objects(assignment_objs)
    db.commit()
    logger.info(f"[Step 2] Done — {len(assignment_objs)} assignments saved")
