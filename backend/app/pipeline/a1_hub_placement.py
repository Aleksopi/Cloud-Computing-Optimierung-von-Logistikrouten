"""
Step 1 — Hub Placement
Dijkstra-Inspired Greedy p-Median algorithm (ported from original project).
Removes all Folium/Neo4j dependencies, writes results directly to PostgreSQL.
"""
from __future__ import annotations

import logging
import math

import numpy as np

from app.config import settings
from app.db.models import Hub, Pharmacy, SystemConfig

logger = logging.getLogger(__name__)

# Verteilzentren (VZ): the network must always have between 4 and 6 of them.
N_VZ_MIN = 4
N_VZ_MAX = 6
N_VZ = 4
# Mini-Verteilzentren (mVZ): no fixed maximum — the actual count is derived from
# demand and the minimum-utilisation rule below.
N_MINI_VZ_SEED = 20
HUB_MIN_UTILIZATION = 0.10   # every VZ/mVZ must carry ≥ 10 % of its capacity
HQ_STORAGE_FACTOR = 1.30     # HQ warehouse = 130 % of the total goods demand
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
    density_norm: np.ndarray | None = None,
    warehouse_weight: float = 0.0,
) -> list[int]:
    """Greedy p-median. When ``density_norm``/``warehouse_weight`` are given,
    candidates in densely-populated (expensive-to-build) locations are penalised
    so hubs are pulled towards cheaper land while still covering demand."""
    pharm_arr = np.array(pharmacy_idxs)
    w = weights.copy()
    current_min = np.full(len(pharmacy_idxs), np.inf)
    for p in already_placed:
        current_min = np.minimum(current_min, D[p, pharm_arr])

    placed_all = list(already_placed)
    selected: list[int] = []

    for _ in range(n_hubs):
        # Phase 1 — collect the access-gain of every eligible candidate
        cand_gains: list[tuple[int, float]] = []
        for c in candidate_idxs:
            if c in placed_all or c in selected:
                continue
            if D[c, hq_idx] < min_hq_dist_km:
                continue
            if any(D[c, s] < min_spacing_km for s in placed_all + selected):
                continue
            gain = float(w @ np.maximum(0.0, current_min - D[c, pharm_arr]))
            cand_gains.append((c, gain))
        if not cand_gains:
            break

        # Phase 2 — net score = access-gain − warehouse-cost penalty (∝ best gain)
        max_gain = max((g for _, g in cand_gains), default=0.0) or 1e-9
        best_c, best_score = None, -np.inf
        for c, gain in cand_gains:
            penalty = (warehouse_weight * max_gain * float(density_norm[c])
                       if density_norm is not None else 0.0)
            score = gain - penalty
            if score > best_score:
                best_score, best_c = score, c
        if best_c is None:
            break

        selected.append(best_c)
        placed_all.append(best_c)
        current_min = np.minimum(current_min, D[best_c, pharm_arr])

    return selected


def _assign_pharmacies(
    pharmacies: list[Pharmacy],
    vz_idxs: list[int],
    mvz_idxs: list[int],
    all_coords: list[tuple],
    vz_capacity: int,
    mvz_capacity: int,
    est_demand,
) -> tuple[dict[int, int], dict[int, float], int]:
    """Capacity-aware haversine assignment, keyed by the global candidate index.

    Pharmacies are processed closest-first; each goes to its nearest eligible hub
    with remaining capacity (VZ within the hard radius first, then mVZ, then any
    VZ). Returns ``(pharmacy_id → hub_idx, hub_idx → load, overflow_count)``.
    """
    vz_list  = [(i, all_coords[i][0], all_coords[i][1]) for i in vz_idxs]
    mvz_list = [(i, all_coords[i][0], all_coords[i][1]) for i in mvz_idxs]
    every = vz_list + mvz_list

    load: dict[int, float] = {i: 0.0 for i, _, _ in every}
    cap:  dict[int, float] = {i: vz_capacity for i, _, _ in vz_list}
    cap.update({i: mvz_capacity for i, _, _ in mvz_list})

    def nearest_dist(p):
        return min(_hav(p.lat, p.lon, la, lo) for _, la, lo in every)

    order = sorted(pharmacies, key=nearest_dist)

    assign: dict[int, int] = {}
    overflow = 0
    for p in order:
        d = est_demand(p)
        vz_within = sorted(
            [(i, _hav(p.lat, p.lon, la, lo)) for i, la, lo in vz_list], key=lambda x: x[1]
        )
        mvz_sorted = sorted(
            [(i, _hav(p.lat, p.lon, la, lo)) for i, la, lo in mvz_list], key=lambda x: x[1]
        )
        candidates = (
            [(i, dd) for i, dd in vz_within if dd <= VZ_HARD_RADIUS_KM]
            + mvz_sorted
            + vz_within  # VZ as last resort beyond radius
        )

        chosen = None
        for i, _dd in candidates:
            if load[i] + d <= cap[i]:
                chosen = i
                break
        if chosen is None:
            chosen = candidates[0][0]
            overflow += 1

        assign[p.id] = chosen
        load[chosen] += d

    return assign, load, overflow


def run_hub_placement(pharmacies: list[Pharmacy], db) -> None:
    # Configurable hub capacities (goods units) + demand estimate proxy
    sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
    n_vz          = int(float(sys_raw.get("n_vz",          str(N_VZ))))
    n_vz          = max(N_VZ_MIN, min(N_VZ_MAX, n_vz))   # enforce 4 ≤ VZ ≤ 6
    n_mvz_seed    = int(float(sys_raw.get("n_mvz",         str(N_MINI_VZ_SEED))))
    vz_capacity   = int(float(sys_raw.get("vz_capacity",   "600")))
    mvz_capacity  = int(float(sys_raw.get("mvz_capacity",  "125")))
    min_util      = float(sys_raw.get("hub_min_utilization", str(HUB_MIN_UTILIZATION)))
    hq_factor     = float(sys_raw.get("hq_storage_factor",   str(HQ_STORAGE_FACTOR)))
    demand_est    = float(sys_raw.get("default_demand_est", "3"))
    # Location-dependent warehouse costs (denser surroundings = pricier land)
    wh_cost_hq    = float(sys_raw.get("warehouse_cost_hq",   "4000"))
    wh_cost_vz    = float(sys_raw.get("warehouse_cost_vz",   "1500"))
    wh_cost_mvz   = float(sys_raw.get("warehouse_cost_mvz",  "500"))
    wh_dens_cost  = float(sys_raw.get("warehouse_density_cost",   "4.0"))
    wh_dens_radius= float(sys_raw.get("warehouse_density_radius_km", "8.0"))
    wh_weight     = float(sys_raw.get("warehouse_density_weight", "0.35"))
    # Per-hub delivery shift (seeded from the global default → editable per hub later)
    shift_start   = float(sys_raw.get("shift_start", "8.0"))
    shift_hours   = float(sys_raw.get("shift_hours", "8.0"))
    logger.info(
        f"[Step 2] Config: {n_vz} VZ (cap {vz_capacity}) + mVZ automatisch (cap {mvz_capacity}) | "
        f"Mindestauslastung {min_util:.0%} | HQ-Lager ×{hq_factor:.2f} | Lagerkosten-Gewicht {wh_weight}"
    )
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

    # ── Local demand density per candidate (land-price proxy) ──────────────────
    # density[i] = total demand of pharmacies within wh_dens_radius of point i.
    # Denser surroundings ⇒ more expensive warehouse ⇒ penalised in placement.
    pharm_arr = np.array(pharm_idxs)
    density = np.zeros(len(all_coords))
    for c in pharm_idxs:
        density[c] = float(demand_weights[D[c, pharm_arr] <= wh_dens_radius].sum())
    density[hq_idx] = float(demand_weights[D[hq_idx, pharm_arr] <= wh_dens_radius].sum())
    max_density = max(float(density[pharm_arr].max()), 1.0)
    density_norm = density / max_density
    logger.info(f"[Step 2] Local density: max={max_density:.0f} units within {wh_dens_radius} km")

    # Warehouse cost (CHF) of placing a hub of `base` cost at global index `idx`
    # (cast away numpy scalar so psycopg2 can serialise it)
    def warehouse_cost(idx: int, base: float) -> float:
        return round(float(base) + float(density[idx]) * wh_dens_cost, 2)

    logger.info(f"[Step 2] Placing {n_vz} VZs (demand-weighted, cost-aware)…")
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
        density_norm=density_norm,
        warehouse_weight=wh_weight,
    )

    # mVZ have no fixed maximum. We request a demand-driven candidate pool; the
    # ≥18 km spacing and the minimum-utilisation prune below decide the final count.
    total_demand = int(sum(float(p.demand or demand_est) for p in pharmacies))
    mvz_target = max(n_mvz_seed, math.ceil(total_demand / max(1, mvz_capacity)) + 4)
    logger.info(f"[Step 2] Placing up to {mvz_target} Mini-VZ candidates (demand-weighted, cost-aware)…")
    mini_vz_indices = _greedy_pmedian(
        candidate_idxs=pharm_idxs,
        pharmacy_idxs=pharm_idxs,
        D=D,
        weights=demand_norm,
        n_hubs=mvz_target,
        already_placed=[hq_idx] + vz_indices,
        min_spacing_km=MINI_VZ_MIN_SPACING_KM,
        min_hq_dist_km=HUB_MIN_DIST_FROM_HQ_KM,
        hq_idx=hq_idx,
        density_norm=density_norm,
        warehouse_weight=wh_weight,
    )

    # ── Minimum-utilisation prune ─────────────────────────────────────────────
    # Every surviving hub must carry ≥ ``min_util`` of its capacity. We assign
    # pharmacies (capacity-aware), drop the single emptiest hub that misses the
    # bar, and re-assign — repeating until all remaining hubs clear it. Dropping
    # a hub only ever raises the utilisation of the rest, so this terminates.
    # VZ are never reduced below N_VZ_MIN; mVZ have no lower bound (demand-driven).
    vz_idxs  = list(vz_indices)
    mvz_idxs = list(mini_vz_indices)

    assign, load, overflow = _assign_pharmacies(
        pharmacies, vz_idxs, mvz_idxs, all_coords, vz_capacity, mvz_capacity, est_demand)
    while True:
        droppable: list[tuple[float, int, str]] = []
        for i in mvz_idxs:
            u = load[i] / mvz_capacity
            if u < min_util:
                droppable.append((u, i, "mVZ"))
        if len(vz_idxs) > N_VZ_MIN:
            for i in vz_idxs:
                u = load[i] / vz_capacity
                if u < min_util:
                    droppable.append((u, i, "VZ"))
        if not droppable:
            break
        droppable.sort(key=lambda x: x[0])           # emptiest hub first
        u_drop, drop_i, drop_t = droppable[0]
        (vz_idxs if drop_t == "VZ" else mvz_idxs).remove(drop_i)
        logger.info(
            f"[Step 2] {drop_t} entfernt (Auslastung {u_drop:.0%} < {min_util:.0%}) — "
            f"verbleibend {len(vz_idxs)} VZ + {len(mvz_idxs)} mVZ"
        )
        assign, load, overflow = _assign_pharmacies(
            pharmacies, vz_idxs, mvz_idxs, all_coords, vz_capacity, mvz_capacity, est_demand)

    logger.info(
        f"[Step 2] Netz festgelegt: {len(vz_idxs)} VZ + {len(mvz_idxs)} mVZ "
        f"(je ≥ {min_util:.0%} Lagerauslastung)"
    )

    # ── Persist hubs (with configurable warehouse capacity + opening hours) ───
    db.query(Hub).delete()
    db.commit()
    hq_o, hq_c   = hub_hours["HQ"]
    vz_o, vz_c   = hub_hours["VZ"]
    mvz_o, mvz_c = hub_hours["mVZ"]

    # HQ warehouse = full goods demand + 30 % reserve (→ 130 % of total demand).
    hq_capacity = int(math.ceil(total_demand * hq_factor))
    db.add(Hub(name=settings.hq_name, hub_type="HQ", lat=hq[0], lon=hq[1],
               capacity=hq_capacity,
               open_hour=hq_o, close_hour=hq_c,
               shift_start=shift_start, shift_hours=shift_hours,
               warehouse_cost=warehouse_cost(hq_idx, wh_cost_hq)))
    logger.info(f"[Step 2] HQ-Lager {hq_capacity} Einh. ({hq_factor:.0%} von {total_demand})")

    # Clean sequential names for the surviving hubs
    vz_name  = {idx: f"VZ_{k}"  for k, idx in enumerate(vz_idxs, 1)}
    mvz_name = {idx: f"mVZ_{k}" for k, idx in enumerate(mvz_idxs, 1)}

    vz_list: list[tuple[str, float, float]] = []
    for idx in vz_idxs:
        lat, lon = all_coords[idx]
        name = vz_name[idx]
        db.add(Hub(name=name, hub_type="VZ", lat=round(lat, 6), lon=round(lon, 6),
                   capacity=vz_capacity, open_hour=vz_o, close_hour=vz_c,
                   shift_start=shift_start, shift_hours=shift_hours,
                   warehouse_cost=warehouse_cost(idx, wh_cost_vz)))
        vz_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f}) · Auslastung {load[idx]/vz_capacity:.0%}"
                    f" · Lager CHF {warehouse_cost(idx, wh_cost_vz):.0f}")

    mini_list: list[tuple[str, float, float]] = []
    for idx in mvz_idxs:
        lat, lon = all_coords[idx]
        name = mvz_name[idx]
        db.add(Hub(name=name, hub_type="mVZ", lat=round(lat, 6), lon=round(lon, 6),
                   capacity=mvz_capacity, open_hour=mvz_o, close_hour=mvz_c,
                   shift_start=shift_start, shift_hours=shift_hours,
                   warehouse_cost=warehouse_cost(idx, wh_cost_mvz)))
        mini_list.append((name, lat, lon))
        logger.info(f"  {name} → ({lat:.4f}, {lon:.4f}) · Auslastung {load[idx]/mvz_capacity:.0%}"
                    f" · Lager CHF {warehouse_cost(idx, wh_cost_mvz):.0f}")

    db.commit()

    # Assign parent VZ to each mVZ (nearest VZ by haversine)
    for hub_obj in db.query(Hub).filter(Hub.hub_type == "mVZ").all():
        nearest_vz = min(vz_list, key=lambda t: _hav(hub_obj.lat, hub_obj.lon, t[1], t[2]))
        hub_obj.parent_hub = nearest_vz[0]
    db.commit()
    logger.info("[Step 2] mVZ parent assignments written")

    # ── Seed the preliminary hub assignment onto the pharmacies ──────────────
    # Step 3 re-assigns by real road time; this writes the capacity-aware result.
    name_of = {**vz_name, **mvz_name}
    assigned_vz = assigned_mini = 0
    for p in pharmacies:
        chosen = name_of[assign[p.id]]
        p.hub_name = chosen
        if chosen.startswith("VZ"):
            assigned_vz += 1
        else:
            assigned_mini += 1
    db.commit()
    logger.info(
        f"[Step 2] Done — {assigned_vz} → VZ, {assigned_mini} → mVZ, "
        f"{overflow} over-capacity overflow assignments"
    )
