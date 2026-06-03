"""
Step 3: Variable Consumption Demand Engine (Geometric Market Catchment)
========================================================================
Calculates per-pharmacy ware demand using an optimized Neo4j spatial join
against the Eurostat 2021 Census 1km² grid (Switzerland subset).

This module owns the full Step 3 pipeline:
  1. Purge stale population nodes and reload fresh from Swiss GeoJSON asset
  2. Ensure native structural and spatial point indexes exist (O(1) lookups)
  3. Compute geometric nearest-competitor bounds across the network layout
  4. Sum population grids within the calculated dynamic catchment radii
  5. Derive final ware demand, write results back to Neo4j Pharmacy nodes, 
     and return a ranked DataFrame.

Catchment radius strategy
--------------------------
  • Competitive Geometric Capture: Dynamically calculated as 2/3 of the 
    distance to the nearest competing pharmacy node in the graph.
  • Boundary Cap: Hard-capped at a maximum threshold of 10.0 km.

Consumption rule
----------------
  1 ware per `consumption_rate` residents within the custom catchment circle 
  (default 12 000, range 8k–15k). Minimum 1 ware per pharmacy.

Notebook usage (only call needed)
-----------------------------------
  from a3_demand import calculate_demand
  df_ranked = calculate_demand(pharmacy_df, consumption_rate=12000, max_radius_km=10.0)

Neo4j connection is read from environment variables:
  NEO4J_URI       (default: bolt://localhost:7687)
  NEO4J_USER      (default: neo4j)
  NEO4J_PASSWORD  (default: Tr0p1c@lM0nk3y92)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

from log import logger
from neo4j_handler import Neo4jHandler


# ── Census data path (relative to notebook working directory) ─────────────────
_CENSUS_GEOJSON = Path("../../workspace/data/estat_switzerland.geojson")

# ── Neo4j connection (from environment, matching docker-compose) ──────────────
_NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
_NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
_NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "Tr0p1c@lM0nk3y92")


# ─────────────────────────────────────────────────────────────────────────────
# Internal: census loader (Optimized O(1) Sequential Ingestion Layer)
# ─────────────────────────────────────────────────────────────────────────────

def _load_census_fresh(neo4j: Neo4jHandler, geojson_path: Path) -> None:
    """
    Purges existing PopulationCell nodes and reloads them fresh.
    Uses CREATE instead of MERGE to bypass unindexed node scan penalties.
    """
    logger.info("[Step 3] 🗑️ Purging existing PopulationCell nodes to guarantee clean state...")
    neo4j.run("MATCH (c:PopulationCell) DETACH DELETE c")
    
    neo4j.ensure_index("PopulationCell", "grd_id")

    logger.info(f"[Step 3] Loading fresh census grid from {geojson_path} …")
    if not geojson_path.exists():
        raise FileNotFoundError(f"[Step 3] Census file missing at: {geojson_path.resolve()}")

    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)

    records = []
    skipped = 0
    
    lat_min, lat_max = 45.0, 48.5
    lon_min, lon_max = 5.0, 11.0

    for feat in gj.get("features", []):
        props = feat.get("properties", {})
        geom  = feat.get("geometry", {})

        lat = props.get("latitude") or props.get("lat")
        lon = props.get("longitude") or props.get("lon")

        if (lat is None or lon is None) and geom.get("type") == "Polygon":
            ring = geom["coordinates"][0]
            lon  = sum(c[0] for c in ring) / len(ring)
            lat  = sum(c[1] for c in ring) / len(ring)

        if lat is None or lon is None:
            skipped += 1
            continue

        lat = float(lat)
        lon = float(lon)

        if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
            skipped += 1
            continue

        records.append({
            "grd_id":       str(props.get("GRD_ID", "")),
            "pop_total":    int(props.get("pop_total", 0)),
            "land_surface": float(props.get("LAND_SURFACE", 1.0)),
            "lat":          lat,
            "lon":          lon,
        })

    if skipped:
        logger.warning(f"[Step 3] Excluded {skipped} cells outside boundaries or missing data profiles.")

    if not records:
        raise RuntimeError(f"[Step 3] Critical: No valid features parsed from {geojson_path}.")

    loaded = neo4j.run_batch(
        """
        UNWIND $rows AS row
        CREATE (c:PopulationCell)
        SET c.grd_id       = row.grd_id,
            c.pop_total    = row.pop_total,
            c.land_surface = row.land_surface,
            c.lat          = row.lat,
            c.lon          = row.lon,
            c.location     = point({latitude: row.lat, longitude: row.lon, srid: 4326})
        """,
        rows=records,
    )
    logger.info(f"[Step 3] ✅ Census grid successfully loaded: {loaded} cells.")
    _diagnose_census(neo4j)


# ─────────────────────────────────────────────────────────────────────────────
# Internal: Diagnostic Sanity Verifications
# ─────────────────────────────────────────────────────────────────────────────

def _diagnose_census(neo4j: Neo4jHandler) -> None:
    """Verifies coordinate validity and runs a test check against a known hub."""
    sample = neo4j.run_one(
        "MATCH (c:PopulationCell) WHERE c.pop_total > 0 "
        "RETURN c.grd_id AS grd_id, c.lat AS lat, c.lon AS lon, "
        "c.pop_total AS pop LIMIT 1"
    )
    if not sample:
        logger.warning("[Step 3] Diagnostic Warning: No populated grid cells were found.")
        return

    logger.info(
        f"[Step 3] Sample cell — grd_id={sample['grd_id']}, "
        f"lat={sample['lat']:.4f}, lon={sample['lon']:.4f}, pop={sample['pop']}"
    )

    count = neo4j.run_one(
        """
        WITH point({latitude: 47.3769, longitude: 8.5417, srid: 4326}) AS zurich
        MATCH (c:PopulationCell)
        WHERE point.distance(c.location, zurich) <= 50000
        RETURN count(c) AS n, sum(c.pop_total) AS pop
        """
    )
    if count:
        logger.info(
            f"[Step 3] Diagnostic — cells within 50km of Zürich: "
            f"{count['n']} cells, {count['pop']} people."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Public Execution Framework Interface
# ─────────────────────────────────────────────────────────────────────────────

def calculate_demand(
    pharmacy_df: pd.DataFrame,
    consumption_rate: int = 12000,
    max_radius_km: float = 10.0,
) -> pd.DataFrame:
    """
    Compute per-pharmacy ware demand using a geometric nearest-competitor assignment model.
    """
    logger.info(f"[Step 3] Computing demand via competitive spatial mapping for {len(pharmacy_df)} pharmacies …")

    pharmacy_records = [
        {"pid": int(idx), "lat": float(row["lat"]), "lon": float(row["lon"])}
        for idx, row in pharmacy_df.iterrows()
    ]

    with Neo4jHandler(_NEO4J_URI, _NEO4J_USER, _NEO4J_PASSWORD) as neo4j:
        # 1. Refresh infrastructure nodes
        _load_census_fresh(neo4j, _CENSUS_GEOJSON)
        
        # 2. Assert structural indexes
        neo4j.ensure_index("Pharmacy", "pid")
        neo4j.ensure_point_index("PopulationCell", "location")
        neo4j.ensure_point_index("Pharmacy", "location")

        # 3. Dynamic Competitive Catchment Engine Query
        spatial_join_query = """
        // Pass 1: Ingest all spatial points into the graph network layout
        UNWIND $rows AS row
        MERGE (p:Pharmacy {pid: row.pid})
        SET p.lat       = row.lat,
            p.lon       = row.lon,
            p.location  = point({latitude: row.lat, longitude: row.lon, srid: 4326})
        
        WITH collect(p) AS all_pharmacies
        UNWIND all_pharmacies AS p
        
        // Pass 2: Calculate nearest neighbor competitive distance bounds
        CALL {
            WITH p
            MATCH (other:Pharmacy)
            WHERE other.pid <> p.pid AND other.location IS NOT NULL
            WITH point.distance(p.location, other.location) AS dist_m
            ORDER BY dist_m ASC
            LIMIT 1
            RETURN dist_m AS nearest_competitor_m
        }
        
        // Pass 3: Resolve business rules (2/3 distance to neighbor, capped at max parameter)
        WITH p, coalesce(nearest_competitor_m, $max_radius_km * 1000.0) AS comp_m
        WITH p, (2.0 / 3.0) * (comp_m / 1000.0) AS raw_radius_km
        WITH p, case when raw_radius_km > $max_radius_km then $max_radius_km else raw_radius_km end AS used_radius_km
        
        // Pass 4: Accumulate native population vectors inside the generated custom boundary
        CALL {
            WITH p, used_radius_km
            WITH p, (used_radius_km * 1000.0) AS used_radius_m
            OPTIONAL MATCH (c:PopulationCell)
            WHERE point.distance(c.location, p.location) <= used_radius_m
            RETURN coalesce(sum(c.pop_total), 0) AS final_pop
        }
        
        // Pass 5: Output Metrics Construction
        WITH p, final_pop, used_radius_km,
             case when final_pop <= 0 then 1 
                  else toInteger(ceil(toFloat(final_pop) / $consumption_rate)) 
             end AS wares
        WITH p, final_pop, used_radius_km, wares,
             round(toFloat(final_pop) / (3.141592653589793 * used_radius_km * used_radius_km), 2) AS density
        
        SET p.demand_wares  = wares,
            p.catchment_km  = round(used_radius_km, 3),
            p.estimated_pop = toInteger(final_pop)
            
        RETURN p.pid AS pid, 
               round(used_radius_km, 3) AS catchment_radius_km, 
               toInteger(final_pop) AS estimated_pop_catchment, 
               density AS pop_density_km2, 
               wares AS demand_wares
        """

        results = neo4j.run(
            spatial_join_query,
            rows=pharmacy_records,
            consumption_rate=consumption_rate,
            max_radius_km=max_radius_km,
        )

    # 4. Map Results into Output Dataset Structures
    res_df = pd.DataFrame(results).set_index("pid")
    output_df = pharmacy_df.join(res_df)
    output_df = output_df.sort_values("demand_wares", ascending=False)

    isolated_count = int((output_df["catchment_radius_km"] == max_radius_km).sum())
    logger.info(f"[Step 3] {isolated_count}/{len(pharmacy_df)} pharmacies hit the maximum {max_radius_km}km cap.")
    logger.info(f"[Step 3] ✅ Done. {output_df['demand_wares'].sum()} total wares mapped.")

    return output_df
