"""
01_locations.py  –  Step 1: Hub Placement
==============================================
Budget (fixed):
  1  HQ       (position given by caller)
  4  VZ       (Verteilzentren  – high influence, radius VZ_HARD_RADIUS_KM)
  20 Mini-VZ  (Mini-Verteilzentren – last-mile hubs)

Algorithm: Dijkstra-Inspired Greedy p-Median
---------------------------------------------
Classic greedy p-median / facility-location:

  next_hub = argmax_c  Σ_i  w_i * max(0,  current_min[i]  -  D[c, i])
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# ── Import der neuen Notebook-Infrastruktur ───────────────────────────────────
from log import logger
from result import save_result

# ── Tunable constants ─────────────────────────────────────────────────────────
N_VZ               = 4      # number of VZs to place
N_MINI_VZ          = 20     # number of Mini-VZs to place

VZ_INFLUENCE_WEIGHT = 3.0   # pharmacies are weighted this much heavier during VZ placement
VZ_HARD_RADIUS_KM   = 45.0  # km – pharmacies inside this radius of a VZ go directly to VZ

# Hub spacing / HQ stand-off distances (km)
VZ_MIN_SPACING_KM       = 40.0  # minimum distance between any two VZs
MINI_VZ_MIN_SPACING_KM  = 18.0  # minimum distance between any two Mini-VZs
HUB_MIN_DIST_FROM_HQ_KM = 15.0  # all hubs must be at least this far from HQ
VZ_MIN_DIST_FROM_HQ_KM  = 25.0  # VZs additionally must be this far from HQ


# ── Haversine helpers ─────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Scalar haversine distance in km."""
    R = 6371.0
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = (np.sin(dlat / 2) ** 2
         + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2))
         * np.sin(dlon / 2) ** 2)
    return R * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def _build_dist_matrix(points: list[tuple]) -> np.ndarray:
    """Vectorised NxN haversine distance matrix in km."""
    lats = np.radians(np.array([p[0] for p in points]))
    lons = np.radians(np.array([p[1] for p in points]))

    dlat = lats[:, None] - lats[None, :]
    dlon = lons[:, None] - lons[None, :]

    cos_lat1 = np.cos(lats[:, None])
    cos_lat2 = np.cos(lats[None, :])

    a = np.sin(dlat / 2) ** 2 + cos_lat1 * cos_lat2 * np.sin(dlon / 2) ** 2
    D = 6371.0 * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    np.fill_diagonal(D, 0.0)
    return D


# ── Core algorithm ────────────────────────────────────────────────────────────

def _dijkstra_greedy_pmedian(
    *,
    candidate_idxs: list[int],
    pharmacy_idxs: list[int],
    D: np.ndarray,
    weights: np.ndarray,
    n_hubs: int,
    already_placed: list[int],
    min_spacing_km: float,
    min_hq_dist_km: float,
    hq_idx: int,
) -> list[int]:
    """Greedy p-median placement using Dijkstra-style relaxation."""
    pharm_arr = np.array(pharmacy_idxs)
    w = weights.copy()

    current_min = np.full(len(pharmacy_idxs), np.inf)
    for p in already_placed:
        current_min = np.minimum(current_min, D[p, pharm_arr])

    placed_all = list(already_placed)
    selected: list[int] = []

    for _ in range(n_hubs):
        best_gain = -np.inf
        best_c = None

        for c in candidate_idxs:
            if c in placed_all or c in selected:
                continue
            if D[c, hq_idx] < min_hq_dist_km:
                continue
            if any(D[c, s] < min_spacing_km for s in (placed_all + selected)):
                continue

            savings = np.maximum(0.0, current_min - D[c, pharm_arr])
            gain = float(w @ savings)

            if gain > best_gain:
                best_gain = gain
                best_c = c

        if best_c is None:
            break

        selected.append(best_c)
        placed_all.append(best_c)
        current_min = np.minimum(current_min, D[best_c, pharm_arr])

    return selected


# ── Public API ────────────────────────────────────────────────────────────────

def plan_locations(
    df_pharmacies: pd.DataFrame,
    hq_lat: float,
    hq_lon: float,
    map_obj=None,
    n_vz: int = N_VZ,
    n_mini_vz: int = N_MINI_VZ,
) -> tuple[dict, dict, dict, dict]:
    """
    Führt das Hub-Placement durch, loggt Zwischenschritte, aktualisiert die
    globale Karte und speichert die Ergebnisse am Ende.
    """
    hq = (hq_lat, hq_lon)
    
    # HQ zur Karte hinzufügen, falls gewünscht
    if map_obj is not None:
        # Signatur von add_hub evtl. anpassen, falls dein draw_map Modul andere Parameter nutzt
        map_obj.add_hub(lat=hq_lat, lon=hq_lon, layer="Hubs", name="HQ", hub_type="HQ")

    pharm_ids   = list(df_pharmacies.index)
    pharm_coords = list(zip(df_pharmacies['lat'], df_pharmacies['lon']))

    all_coords  = [hq] + pharm_coords
    hq_idx      = 0
    pharm_idxs  = list(range(1, len(all_coords)))
    candidate_idxs = pharm_idxs

    logger.info(f"[Step 1] Building {len(all_coords)}x{len(all_coords)} haversine distance matrix…")
    D = _build_dist_matrix(all_coords)
    logger.info("[Step 1] Distance matrix ready.")

    vz_weights = np.full(len(pharm_idxs), VZ_INFLUENCE_WEIGHT)

    logger.info(f"[Step 1] Placing {n_vz} VZs via Dijkstra-greedy p-median…")
    vz_indices = _dijkstra_greedy_pmedian(
        candidate_idxs=candidate_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=vz_weights,
        n_hubs=n_vz,
        already_placed=[hq_idx],
        min_spacing_km=VZ_MIN_SPACING_KM,
        min_hq_dist_km=VZ_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    vz_locations: dict[str, tuple] = {}
    for i, vidx in enumerate(vz_indices, 1):
        lat, lon = all_coords[vidx]
        name = f'VZ_{i}'
        vz_locations[name] = (round(lat, 5), round(lon, 5))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")
        
        # Auf die Karte zeichnen
        if map_obj is not None:
            map_obj.add_hub(lat=lat, lon=lon, layer="Hubs", name=name, hub_type="VZ")

    mini_weights = np.ones(len(pharm_idxs))

    logger.info(f"[Step 1] Placing {n_mini_vz} Mini-VZs via Dijkstra-greedy p-median…")
    mini_vz_indices = _dijkstra_greedy_pmedian(
        candidate_idxs=candidate_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=mini_weights,
        n_hubs=n_mini_vz,
        already_placed=[hq_idx] + vz_indices,
        min_spacing_km=MINI_VZ_MIN_SPACING_KM,
        min_hq_dist_km=HUB_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    mini_vz_locations: dict[str, tuple] = {}
    for i, midx in enumerate(mini_vz_indices, 1):
        lat, lon = all_coords[midx]
        name = f'mVZ_{i}'
        mini_vz_locations[name] = (round(lat, 5), round(lon, 5))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")
        
        # Auf die Karte zeichnen
        if map_obj is not None:
            map_obj.add_hub(lat=lat, lon=lon, layer="Hubs", name=name, hub_type="Mini-VZ")

    assignments: dict       = {}
    hub_to_pharmacies: dict = {name: [] for name in {**vz_locations, **mini_vz_locations}}

    vz_coords_list   = [(name, coords) for name, coords in vz_locations.items()]
    mini_coords_list = [(name, coords) for name, coords in mini_vz_locations.items()]

    assigned_vz   = 0
    assigned_mini = 0
    unassigned    = 0

    for pid, (plat, plon) in zip(pharm_ids, pharm_coords):
        best_vz, best_vz_dist = None, np.inf
        for vname, (vlat, vlon) in vz_coords_list:
            d = _haversine_km(plat, plon, vlat, vlon)
            if d < best_vz_dist:
                best_vz_dist = d
                best_vz = vname

        if best_vz_dist <= VZ_HARD_RADIUS_KM:
            assignments[pid] = best_vz
            hub_to_pharmacies[best_vz].append(pid)
            assigned_vz += 1
        else:
            best_mini, best_mini_dist = None, np.inf
            for mname, (mlat, mlon) in mini_coords_list:
                d = _haversine_km(plat, plon, mlat, mlon)
                if d < best_mini_dist:
                    best_mini_dist = d
                    best_mini = mname

            if best_mini is not None:
                assignments[pid] = best_mini
                hub_to_pharmacies[best_mini].append(pid)
                assigned_mini += 1
            else:
                assignments[pid] = best_vz
                hub_to_pharmacies[best_vz].append(pid)
                unassigned += 1

    total = len(pharm_ids)
    logger.info("[Step 1] Assignment summary:")
    logger.info(f"  Direct to VZ:      {assigned_vz:>4} / {total}  ({100*assigned_vz/total:.1f}%)")
    logger.info(f"  Via Mini-VZ:       {assigned_mini:>4} / {total}  ({100*assigned_mini/total:.1f}%)")
    if unassigned:
        logger.info(f"  Fallback (no mVZ): {unassigned:>4}")

    # ── Ergebnisse abspeichern ──────────────────────────────────────────────
    result_data = {
        "vz_locations": vz_locations,
        "mini_vz_locations": mini_vz_locations,
        "assignments": assignments,
        "hub_to_pharmacies": hub_to_pharmacies
    }
    save_result("01_locations", result_data)
    logger.info("[Step 1] Ergebnisse erfolgreich gespeichert.")

    return vz_locations, mini_vz_locations, assignments, hub_to_pharmacies
