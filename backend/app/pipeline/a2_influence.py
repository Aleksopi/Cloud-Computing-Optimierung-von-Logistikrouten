"""
Step 3 — Influence / Road-based Hub Assignment
Fetches a full OSRM distance+time matrix in one HTTP call,
then retrieves road geometry for each pharmacy→hub route.

The HQ is included as a delivery hub for pharmacies within hq_direct_radius_km
(road distance). Pharmacies beyond that radius cannot be assigned to HQ.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

from app.db.models import Assignment, Hub, Pharmacy, SystemConfig
from app.services.osrm import osrm_geometry, osrm_table

logger = logging.getLogger(__name__)


def run_influence(pharmacies: list[Pharmacy], hubs: list[Hub], db) -> None:
    """
    `hubs` contains all non-HQ hubs (VZ + mVZ).
    We additionally fetch HQ from DB and include it as a direct-delivery option
    for pharmacies within hq_direct_radius_km road distance.
    """
    if not hubs:
        raise ValueError("No hubs found — run Step 2 first")

    sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
    demand_est        = float(sys_raw.get("default_demand_est",    "3"))
    hq_direct_radius  = float(sys_raw.get("hq_direct_radius_km",  "20.0"))

    # Add HQ as candidate hub (for direct last-mile within radius)
    hq_hub  = db.query(Hub).filter(Hub.hub_type == "HQ").first()
    all_hubs: list[Hub] = ([hq_hub] if hq_hub else []) + list(hubs)
    hq_list_idx        = 0 if hq_hub else None  # index of HQ in all_hubs
    hq_cap             = hq_hub.capacity if hq_hub and hq_hub.capacity else 10_000_000

    p_coords  = [(p.lat, p.lon) for p in pharmacies]
    h_coords  = [(h.lat, h.lon) for h in all_hubs]
    h_names   = [h.name        for h in all_hubs]
    hub_cap   = {h.name: (h.capacity if h.capacity else 10_000_000) for h in all_hubs}
    n_p       = len(pharmacies)

    logger.info(
        f"[Step 3] OSRM table: {n_p} pharmacies × {len(all_hubs)} hubs "
        f"(HQ direct ≤ {hq_direct_radius} km)…"
    )
    dist_km, time_h = osrm_table(p_coords, h_coords)

    # ── Mask HQ for pharmacies beyond direct-delivery radius ──────────────────
    if hq_hub is not None and hq_list_idx is not None:
        out_of_radius = 0
        for i in range(n_p):
            if dist_km[i, hq_list_idx] > hq_direct_radius:
                dist_km[i, hq_list_idx] = 1e9
                time_h[i, hq_list_idx]  = 1e9
                out_of_radius += 1
        logger.info(
            f"[Step 3] HQ direct: {n_p - out_of_radius} pharmacies within "
            f"{hq_direct_radius} km road distance"
        )

    # ── Capacity-aware assignment by drive time ───────────────────────────────
    # Closest pharmacies (by best drive time) pick first; if their nearest hub
    # is full, they overflow to the next-nearest hub with remaining capacity.
    best_time = np.min(time_h, axis=1)
    p_order   = sorted(range(n_p), key=lambda i: best_time[i])
    load      = {name: 0.0 for name in h_names}

    assignments_map: dict[int, tuple[str, float, float]] = {}
    overflow = 0
    for i in p_order:
        d       = float(pharmacies[i].demand) if pharmacies[i].demand else demand_est
        hub_pref = sorted(range(len(all_hubs)), key=lambda j: time_h[i, j])
        chosen_j = None
        for j in hub_pref:
            if load[h_names[j]] + d <= hub_cap[h_names[j]]:
                chosen_j = j
                break
        if chosen_j is None:
            # All full — assign to nearest (overflow)
            chosen_j = hub_pref[0]
            overflow += 1
        load[h_names[chosen_j]] += d
        assignments_map[i] = (
            h_names[chosen_j],
            float(dist_km[i, chosen_j]),
            float(time_h[i, chosen_j]),
        )

    assigned_to_hq = sum(1 for h, _, _ in assignments_map.values() if hq_hub and h == hq_hub.name)
    logger.info(
        f"[Step 3] Assignment done — {assigned_to_hq} pharmacies assigned to HQ, "
        f"{overflow} over-capacity overflow"
    )

    # ── Fetch road geometries (parallel) ─────────────────────────────────────
    logger.info(f"[Step 3] Fetching {n_p} road geometries (parallel)…")
    hub_by_name = {h.name: h for h in all_hubs}

    def _fetch(i: int):
        hub_name, dist, time = assignments_map[i]
        hub = hub_by_name[hub_name]
        coords = osrm_geometry((hub.lat, hub.lon), p_coords[i])
        return i, hub_name, dist, time, coords

    results: dict[int, tuple] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch, i): i for i in range(n_p)}
        done    = 0
        for fut in as_completed(futures):
            i, hub_name, dist, time, coords = fut.result()
            results[i] = (hub_name, dist, time, coords)
            done += 1
            if done % 50 == 0:
                logger.info(f"[Step 3]   {done}/{n_p} geometries fetched…")

    # ── Persist ───────────────────────────────────────────────────────────────
    db.query(Assignment).delete()
    db.commit()

    assignment_objs = []
    for i, p in enumerate(pharmacies):
        hub_name, dist, time, coords = results[i]
        p.hub_name = hub_name
        assignment_objs.append(
            Assignment(
                pharmacy_id   = p.id,
                hub_name      = hub_name,
                distance_km   = round(dist, 2),
                travel_time_h = round(time, 4),
                route_geometry= coords,
            )
        )

    db.bulk_save_objects(assignment_objs)
    db.commit()
    logger.info(f"[Step 3] Done — {len(assignment_objs)} assignments saved")
