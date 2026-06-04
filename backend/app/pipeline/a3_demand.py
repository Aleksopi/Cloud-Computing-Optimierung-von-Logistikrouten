"""
Step 3 — Demand Calculation
Geometric catchment model using NumPy (replaces Neo4j spatial queries).
Catchment radius per pharmacy = min(2/3 × nearest-competitor distance, 10 km).
Demand = ceil(catchment_population / 12000), minimum 1.
"""
from __future__ import annotations

import logging
import math

import numpy as np

from app.db.models import Pharmacy, PopulationCell

logger = logging.getLogger(__name__)

MAX_CATCHMENT_KM = 10.0
POPULATION_PER_ITEM = 12_000
BATCH_SIZE = 40  # pharmacies per batch to stay memory-friendly


def _hav_matrix(p_lats: np.ndarray, p_lons: np.ndarray, c_lats: np.ndarray, c_lons: np.ndarray) -> np.ndarray:
    """Vectorised haversine → shape (n_pharmacies, n_cells)."""
    R = 6371.0
    p_lats_r = np.radians(p_lats)[:, None]
    p_lons_r = np.radians(p_lons)[:, None]
    c_lats_r = np.radians(c_lats)[None, :]
    c_lons_r = np.radians(c_lons)[None, :]
    dlat = c_lats_r - p_lats_r
    dlon = c_lons_r - p_lons_r
    a = np.sin(dlat / 2) ** 2 + np.cos(p_lats_r) * np.cos(c_lats_r) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def run_demand(db) -> None:
    pharmacies = db.query(Pharmacy).all()
    cells = db.query(PopulationCell).all()

    if not cells:
        raise RuntimeError("No population cells in DB — check that population.geojson was imported")

    logger.info(f"[Step 3] {len(pharmacies)} pharmacies, {len(cells)} population cells")

    p_lats = np.array([p.lat for p in pharmacies])
    p_lons = np.array([p.lon for p in pharmacies])
    c_lats = np.array([c.lat for c in cells])
    c_lons = np.array([c.lon for c in cells])
    c_pop = np.array([c.population for c in cells], dtype=np.float64)

    # Catchment radii: 2/3 × nearest-competitor distance, capped at MAX_CATCHMENT_KM
    logger.info("[Step 3] Computing catchment radii…")
    pp_dist = _hav_matrix(p_lats, p_lons, p_lats, p_lons)
    np.fill_diagonal(pp_dist, np.inf)
    nearest_km = np.min(pp_dist, axis=1)
    radii_km = np.minimum(nearest_km * (2.0 / 3.0), MAX_CATCHMENT_KM)

    # Batch spatial join
    logger.info("[Step 3] Computing population sums (batched)…")
    for batch_start in range(0, len(pharmacies), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(pharmacies))
        b_lats = p_lats[batch_start:batch_end]
        b_lons = p_lons[batch_start:batch_end]

        dist_batch = _hav_matrix(b_lats, b_lons, c_lats, c_lons)  # (batch, n_cells)

        for j, p in enumerate(pharmacies[batch_start:batch_end]):
            radius = radii_km[batch_start + j]
            pop_sum = float(c_pop[dist_batch[j] <= radius].sum())
            p.demand = max(1, math.ceil(pop_sum / POPULATION_PER_ITEM))

        if batch_start % 200 == 0:
            logger.info(f"[Step 3]   {batch_end}/{len(pharmacies)} pharmacies processed…")

    db.commit()
    demands = [p.demand for p in pharmacies]
    logger.info(
        f"[Step 3] Done — demand range {min(demands)}–{max(demands)}, "
        f"total {sum(demands)} items"
    )
