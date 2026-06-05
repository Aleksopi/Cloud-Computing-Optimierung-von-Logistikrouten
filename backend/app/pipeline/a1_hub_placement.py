"""
Step 1 — Hub Placement
Dijkstra-Inspired Greedy p-Median algorithm (ported from original project).
Removes all Folium/Neo4j dependencies, writes results directly to PostgreSQL.
"""
from __future__ import annotations

import logging

import numpy as np

from app.config import settings
from app.db.models import Hub, Pharmacy, SystemConfig

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
    # Configurable hub capacities (goods units) + demand estimate proxy
    sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
    n_vz          = int(float(sys_raw.get("n_vz",          str(N_VZ))))
    n_mvz         = int(float(sys_raw.get("n_mvz",         str(N_MINI_VZ))))
    vz_capacity   = int(float(sys_raw.get("vz_capacity",   "600")))
    mvz_capacity  = int(float(sys_raw.get("mvz_capacity",  "125")))
    demand_est    = float(sys_raw.get("default_demand_est", "3"))
    logger.info(f"[Step 2] Config: {n_vz} VZ (cap {vz_capacity}) + {n_mvz} mVZ (cap {mvz_capacity})")
    # Hub opening hours from config
    hub_hours = {
        "HQ":  (float(sys_raw.get("hub_hq_open",  "6.0")),  float(sys_raw.get("hub_hq_close",  "22.0"))),
        "VZ":  (float(sys_raw.get("hub_vz_open",  "7.0")),  float(sys_raw.get("hub_vz_close",  "20.0"))),
        "mVZ": (float(sys_raw.get("hub_mvz_open", "8.0")),  float(sys_raw.get("hub_mvz_close", "18.0"))),
    }

    def est_demand(p) -> float:
        return float(p.demand) if p.demand else demand_est

    hq = (settings.hq_lat, settings.hq_lon)
    pharm_coords = [(p.lat, p.lon) for p in pharmacies]
    all_coords = [hq] + pharm_coords
    hq_idx = 0
    pharm_idxs = list(range(1, len(all_coords)))

    logger.info(f"[Step 2] Building {len(all_coords)}×{len(all_coords)} distance matrix…")
    D = _dist_matrix(all_coords)

    # ── Demand-weighted p-median ───────────────────────────────────────────────
    # Demand is known from Step 1 — use actual values as weights so hubs are
    # pulled towards high-demand pharmacies, not just by count / equal weight.
    demand_weights = np.array([float(p.demand or demand_est) for p in pharmacies])
    # Normalise to avoid very large magnitudes (optional, keeps gain comparable)
    demand_norm = demand_weights / max(demand_weights.mean(), 1.0)

    logger.info(
        f"[Step 2] Demand weights: min={demand_weights.min():.1f} "
        f"max={demand_weights.max():.1f} mean={demand_weights.mean():.1f}"
    )

    logger.info(f"[Step 2] Placing {n_vz} VZs (demand-weighted)…")
    vz_indices = _greedy_pmedian(
        candidate_idxs=pharm_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=demand_norm * VZ_INFLUENCE_WEIGHT,
        n_hubs=n_vz,
        already_placed=[hq_idx],
        min_spacing_km=VZ_MIN_SPACING_KM,
        min_hq_dist_km=VZ_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    logger.info(f"[Step 2] Placing {n_mvz} Mini-VZs (demand-weighted)…")
    mini_vz_indices = _greedy_pmedian(
        candidate_idxs=pharm_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=demand_norm,
        n_hubs=n_mvz,
        already_placed=[hq_idx] + vz_indices,
        min_spacing_km=MINI_VZ_MIN_SPACING_KM,
        min_hq_dist_km=HUB_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
    )

    # Persist hubs (with configurable warehouse capacity + opening hours)
    db.query(Hub).delete()
    db.commit()
    hq_o, hq_c   = hub_hours["HQ"]
    vz_o, vz_c   = hub_hours["VZ"]
    mvz_o, mvz_c = hub_hours["mVZ"]

    # HQ capacity = total demand of ALL pharmacies (all goods originate here)
    total_demand = int(sum(float(p.demand or demand_est) for p in pharmacies))
    db.add(Hub(name=settings.hq_name, hub_type="HQ", lat=hq[0], lon=hq[1],
               capacity=total_demand,
               open_hour=hq_o, close_hour=hq_c))

    vz_list: list[tuple[str, float, float]] = []
    for i, vidx in enumerate(vz_indices, 1):
        lat, lon = all_coords[vidx]
        name = f"VZ_{i}"
        db.add(Hub(name=name, hub_type="VZ", lat=round(lat, 6), lon=round(lon, 6),
                   capacity=vz_capacity, open_hour=vz_o, close_hour=vz_c))
        vz_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")

    mini_list: list[tuple[str, float, float]] = []
    for i, midx in enumerate(mini_vz_indices, 1):
        lat, lon = all_coords[midx]
        name = f"mVZ_{i}"
        db.add(Hub(name=name, hub_type="mVZ", lat=round(lat, 6), lon=round(lon, 6),
                   capacity=mvz_capacity, open_hour=mvz_o, close_hour=mvz_c))
        mini_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f})")

    db.commit()

    # Assign parent VZ to each mVZ (nearest VZ by haversine)
    for hub_obj in db.query(Hub).filter(Hub.hub_type == "mVZ").all():
        nearest_vz = min(vz_list, key=lambda t: _hav(hub_obj.lat, hub_obj.lon, t[1], t[2]))
        hub_obj.parent_hub = nearest_vz[0]
    db.commit()
    logger.info(f"[Step 2] mVZ parent assignments written")

    # ── Capacity-aware assignment (haversine + warehouse limits) ─────────────
    # Each hub holds at most `capacity` goods units. Pharmacies are assigned to
    # their nearest eligible hub that still has room; if full, they overflow to
    # the next-nearest hub with capacity. Closer pharmacies get priority.
    load: dict[str, float] = {name: 0.0 for name, _, _ in vz_list + mini_list}
    cap = {name: vz_capacity for name, _, _ in vz_list}
    cap.update({name: mvz_capacity for name, _, _ in mini_list})

    # Sort pharmacies by distance to their nearest hub (closest first → priority)
    def nearest_dist(p):
        return min(_hav(p.lat, p.lon, t[1], t[2]) for t in vz_list + mini_list)
    order = sorted(pharmacies, key=nearest_dist)

    assigned_vz = assigned_mini = overflow = 0
    for p in order:
        d = est_demand(p)
        # Preference order: VZs within hard radius first (by distance), then all mVZs, then any hub
        vz_within = sorted(
            [(name, _hav(p.lat, p.lon, la, lo)) for name, la, lo in vz_list],
            key=lambda x: x[1],
        )
        mvz_sorted = sorted(
            [(name, _hav(p.lat, p.lon, la, lo)) for name, la, lo in mini_list],
            key=lambda x: x[1],
        )
        candidates = (
            [(n, dd) for n, dd in vz_within if dd <= VZ_HARD_RADIUS_KM]
            + mvz_sorted
            + vz_within  # VZ as last resort beyond radius
        )

        chosen = None
        for name, _dd in candidates:
            if load[name] + d <= cap[name]:
                chosen = name
                break
        if chosen is None:
            # All eligible hubs full → assign to overall nearest (over capacity)
            chosen = candidates[0][0]
            overflow += 1

        p.hub_name = chosen
        load[chosen] += d
        if chosen.startswith("VZ"):
            assigned_vz += 1
        else:
            assigned_mini += 1

    db.commit()
    logger.info(
        f"[Step 2] Done — {assigned_vz} → VZ, {assigned_mini} → mVZ, "
        f"{overflow} over-capacity overflow assignments"
    )
