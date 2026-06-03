"""
a2_influence.py – Step 2: Nearest-hub assignment by road distance.

Each pharmacy is assigned to the VZ / mVZ with the smallest driving
distance (or travel time).  Road geometry is fetched in parallel from
OSRM and drawn as a real road polyline via draw_interface.add_route_coords.

Usage (from notebook):
    from a2_influence import calculate_influence

    final_assignments = calculate_influence(
        hub_locations = hub_locs,           # {hub_name: (lat, lon)}  — VZ + mVZ only
        pharmacy_df   = df_pharmacies,       # columns: lat, lon
        map_obj       = map_influence.drawInterface,
    )
    # returns {pharmacy_index: hub_name}

Note
----
Assignment uses greedy nearest-hub (argmin per row of the distance matrix).
For a globally load-balanced assignment use engine.solve_assignment() instead.
"""

from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

from log import logger
from utils import utils

engine = utils.engine

# ── Colour palettes mirrored from draw_interface ─────────────────────────────
# One fixed colour is picked per hub (by index) so every route belonging to
# the same hub shares a colour, making influence zones visually distinct.
_LKW_COLORS  = ['#FF8C00', '#FFA500', '#E65C00', '#FF6B00',
                 '#FF7F50', '#FF9933', '#CC5500', '#FFAA00']
_EVAN_COLORS = ['#2E8B57', '#3CB371', '#00A86B', '#66BB6A',
                '#43A047', '#00897B', '#4CAF50', '#1B7F4A']


def _hub_style(hub_name: str, hub_index: int) -> tuple[str, float]:
    """Return (color, line_weight) for a hub.

    mVZ / mini hubs get EVAN green tones (lighter line).
    VZ hubs get LKW orange tones (slightly heavier line).
    """
    n = hub_name.upper()
    if 'MVZ' in n or 'MINI' in n:
        return _EVAN_COLORS[hub_index % len(_EVAN_COLORS)], 2.0
    return _LKW_COLORS[hub_index % len(_LKW_COLORS)], 2.5


def calculate_influence(
    hub_locations: dict,
    pharmacy_df,
    map_obj,
    metric: str = "time",  # Changed default from "distance" to "time"
    max_workers: int = 1,   # Set to 1 to prevent OSRM concurrency/thread-safety failures
) -> dict:
    """
    Assign each pharmacy to the nearest hub by road distance (default)
    or road travel time, then draw the OSRM road route as a polyline.

    Parameters
    ----------
    hub_locations : {hub_name: (lat, lon)}  — pass VZ + mVZ only, not HQ
    pharmacy_df   : pd.DataFrame with 'lat' and 'lon' columns
    map_obj       : draw_interface  (uses add_route_coords)
    metric        : 'distance' (km)  |  'time' (hours)
    max_workers   : parallel threads for OSRM geometry calls

    Returns
    -------
    {pharmacy_index: hub_name}
    """

    # ── 1.  Coordinate lists ─────────────────────────────────────────────────
    p_idx    = pharmacy_df.index.tolist()
    p_coords = list(zip(pharmacy_df["lat"], pharmacy_df["lon"]))
    h_names  = list(hub_locations.keys())
    h_coords = list(hub_locations.values())
    n_p      = len(p_idx)

    logger.info(
        f"[Step 2] Assigning {n_p} pharmacies → "
        f"{len(h_names)} hubs  (metric={metric}) …"
    )

    # ── 2.  Batch distance + time matrix  (single OSRM /table call) ──────────
    dist_mat, time_mat = engine.table(p_coords, h_coords)   # shape (n_p, n_h)
    cost_mat = dist_mat if metric == "distance" else time_mat

    # ── 3.  Nearest-hub assignment  (argmin per pharmacy) ────────────────────
    best_hub_idx = np.argmin(cost_mat, axis=1)              # shape (n_p,)
    assignments  = {
        p_idx[i]: h_names[int(best_hub_idx[i])]
        for i in range(n_p)
    }

    counts = Counter(assignments.values())
    logger.info("[Step 2] Assignment summary:")
    for hub in h_names:
        logger.info(f"  {hub:30s}  {counts.get(hub, 0):>3} pharmacies")

    # ── 4.  Per-hub style (colour + weight) ──────────────────────────────────
    h_col_idx = {name: j for j, name in enumerate(h_names)}
    hub_style = {name: _hub_style(name, j) for j, name in enumerate(h_names)}

    # ── 5.  OSRM geometry fetch ──────────────────────────────────────────────
    logger.info(
        f"[Step 2] Fetching {n_p} road geometries "
        f"({max_workers} parallel threads) …"
    )

    def _fetch(i: int):
        pid      = p_idx[i]
        hub_name = assignments[pid]
        coords   = engine.geometry(
            hub_locations[hub_name],    # origin  : hub
            p_coords[i],                # dest    : pharmacy
        )                               # → [(lat, lon), …]
        dist_km  = round(float(dist_mat[i, h_col_idx[hub_name]]), 1)
        return pid, hub_name, coords, dist_km

    geometries: dict = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch, i): i for i in range(n_p)}
        done = 0
        for fut in as_completed(futures):
            i = futures[fut]
            try:
                pid, hub_name, coords, dist_km = fut.result()
                geometries[pid] = (hub_name, coords, dist_km)
            except Exception as exc:
                pid      = p_idx[i]
                hub_name = assignments[pid]
                logger.warning(f"  geometry failed for pharmacy {pid}: {exc}")
                geometries[pid] = (
                    hub_name,
                    [list(hub_locations[hub_name]), list(p_coords[i])],
                    0.0,
                )
            done += 1
            if done % 50 == 0 or done == n_p:
                logger.info(f"  … {done}/{n_p} geometries ready")

    # ── 6.  Draw road polylines (sequential – folium is not thread-safe) ─────
    logger.info("[Step 2] Drawing routes on map …")

    for pid, (hub_name, coords, dist_km) in geometries.items():
        color, _ = hub_style[hub_name]  # Unpack color, override weight below
        map_obj.add_route_coords(
            coords    = [list(pt) for pt in coords],  # tuples → lists for JSON
            color     = color,
            weight    = 1.2,    # Fixed to explicit user request
            opacity   = 1.0,    # Fixed to explicit user request
            layer     = hub_name,
            tooltip   = f"Pharmacy {pid} → {hub_name} ({dist_km} km)",
        )

    logger.info("[Step 2] ✅ Influence map complete.")
    return assignments
