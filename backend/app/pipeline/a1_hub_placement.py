"""
Step 1 — Hub Placement
Dijkstra-Inspired Greedy p-Median algorithm (ported from original project).
Removes all Folium/Neo4j dependencies, writes results directly to PostgreSQL.
"""
from __future__ import annotations

import logging

import numpy as np

from app.config import settings
from app.db.models import Hub, Pharmacy

logger = logging.getLogger(__name__)

N_VZ = 4
N_MINI_VZ = 20
VZ_INFLUENCE_WEIGHT = 3.0
VZ_HARD_RADIUS_KM = 45.0
VZ_MIN_SPACING_KM = 40.0
MINI_VZ_MIN_SPACING_KM = 18.0
HUB_MIN_DIST_FROM_HQ_KM = 15.0
VZ_MIN_DIST_FROM_HQ_KM = 25.0


def _hav(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def _dist_matrix(points: list[tuple]) -> np.ndarray:
    lats = np.radians(np.array([p[0] for p in points]))
    lons = np.radians(np.array([p[1] for p in points]))
    dlat = lats[:, None] - lats[None, :]
    dlon = lons[:, None] - lons[None, :]
    a = np.sin(dlat / 2) ** 2 + np.cos(lats[:, None]) * np.cos(lats[None, :]) * np.sin(dlon / 2) ** 2
    D = 6371.0 * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    np.fill_diagonal(D, 0.0)
    return D


def _greedy_pmedian(
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
    pharm_arr = np.array(pharmacy_idxs)
    w = weights.copy()
    current_min = np.full(len(pharmacy_idxs), np.inf)
    for p in already_placed:
        current_min = np.minimum(current_min, D[p, pharm_arr])

    placed_all = list(already_placed)
    selected: list[int] = []

    for _ in range(n_hubs):
        best_gain, best_c = -np.inf, None
        for c in candidate_idxs:
            if c in placed_all or c in selected:
                continue
            if D[c, hq_idx] < min_hq_dist_km:
                continue
            if any(D[c, s] < min_spacing_km for s in placed_all + selected):
                continue
            gain = float(w @ np.maximum(0.0, current_min - D[c, pharm_arr]))
            if gain > best_gain:
                best_gain, best_c = gain, c
        if best_c is None:
            break
        selected.append(best_c)
        placed_all.append(best_c)
        current_min = np.minimum(current_min, D[best_c, pharm_arr])

    return selected


def run_hub_placement(pharmacies: list[Pharmacy], db) -> None:
    hq = (settings.hq_lat, settings.hq_lon)
    pharm_coords = [(p.lat, p.lon) for p in pharmacies]
    all_coords = [hq] + pharm_coords
    hq_idx = 0
    pharm_idxs = list(range(1, len(all_coords)))

    logger.info(f"[Step 1] Building {len(all_coords)}×{len(all_coords)} distance matrix…")
    D = _dist_matrix(all_coords)

    logger.info(f"[Step 1] Placing {N_VZ} VZs…")
    vz_indices = _greedy_pmedian(
        candidate_idxs=pharm_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=np.full(len(pharm_idxs), VZ_INFLUENCE_WEIGHT),
        n_hubs=N_VZ,
        already_placed=[hq_idx],
        min_spacing_km=VZ_MIN_SPACING_KM,
        min_hq_dist_km=VZ_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    logger.info(f"[Step 1] Placing {N_MINI_VZ} Mini-VZs…")
    mini_vz_indices = _greedy_pmedian(
        candidate_idxs=pharm_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=np.ones(len(pharm_idxs)),
        n_hubs=N_MINI_VZ,
        already_placed=[hq_idx] + vz_indices,
        min_spacing_km=MINI_VZ_MIN_SPACING_KM,
        min_hq_dist_km=HUB_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    # Persist hubs
    db.query(Hub).delete()
    db.commit()
    db.add(Hub(name=settings.hq_name, hub_type="HQ", lat=hq[0], lon=hq[1]))

    vz_list: list[tuple[str, float, float]] = []
    for i, vidx in enumerate(vz_indices, 1):
        lat, lon = all_coords[vidx]
        name = f"VZ_{i}"
        db.add(Hub(name=name, hub_type="VZ", lat=round(lat, 6), lon=round(lon, 6)))
        vz_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")

    mini_list: list[tuple[str, float, float]] = []
    for i, midx in enumerate(mini_vz_indices, 1):
        lat, lon = all_coords[midx]
        name = f"mVZ_{i}"
        db.add(Hub(name=name, hub_type="mVZ", lat=round(lat, 6), lon=round(lon, 6)))
        mini_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")

    db.commit()

    # Assign pharmacies by haversine
    assigned_vz = assigned_mini = 0
    for p in pharmacies:
        best_vz = min(vz_list, key=lambda t: _hav(p.lat, p.lon, t[1], t[2]))
        dist_to_best_vz = _hav(p.lat, p.lon, best_vz[1], best_vz[2])

        if dist_to_best_vz <= VZ_HARD_RADIUS_KM:
            p.hub_name = best_vz[0]
            assigned_vz += 1
        else:
            best_mini = min(mini_list, key=lambda t: _hav(p.lat, p.lon, t[1], t[2]))
            p.hub_name = best_mini[0]
            assigned_mini += 1

    db.commit()
    logger.info(f"[Step 1] Done — {assigned_vz} → VZ direct, {assigned_mini} → via mVZ")
