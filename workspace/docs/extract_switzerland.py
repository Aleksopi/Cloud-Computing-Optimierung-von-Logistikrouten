"""
Run this locally to extract Switzerland from ESTAT_Census_2021_V2.parquet
and export as GeoJSON for use in the Neo4j pipeline.

Requirements: pip install pyarrow geopandas pandas shapely
Usage: python extract_switzerland.py  (run from repo root)
"""

import re
import pandas as pd
import geopandas as gpd
from shapely import wkb
from pathlib import Path

PARQUET_PATH = "workspace/docs/ESTAT_Census_2021_V2.parquet"
OUT_PATH     = "workspace/data/estat_switzerland.geojson"

# ── Switzerland bounding box in EPSG:3035 (ETRS89-LAEA, metres) ─────────────
# WGS84 approx: lon 5.9–10.5, lat 45.8–47.9
# EPSG:3035 limits corrected for Switzerland
CH_N_MIN = 2_500_000
CH_N_MAX = 2_800_000
CH_E_MIN = 4_000_000
CH_E_MAX = 4_400_000

def parse_grd_id(grd_id: str):
    """Extract northing and easting in metres from CRS3035RES1000mN{N}E{E}."""
    m = re.search(r'N(\d+)E(\d+)', grd_id)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None

# ── 1. Load ──────────────────────────────────────────────────────────────────
print("Loading parquet …")
df = pd.read_parquet(PARQUET_PATH)
print(f"Full dataset: {len(df):,} rows")

# ── 2. Filter to Switzerland bbox using GRD_ID coordinates ──────────────────
print("Parsing GRD_ID coordinates …")
coords = df['GRD_ID'].apply(parse_grd_id)
df['grd_N'] = coords.apply(lambda x: x[0])
df['grd_E'] = coords.apply(lambda x: x[1])

ch = df[
    (df['grd_N'] >= CH_N_MIN) & (df['grd_N'] <= CH_N_MAX) &
    (df['grd_E'] >= CH_E_MIN) & (df['grd_E'] <= CH_E_MAX)
].copy()
print(f"Switzerland bbox rows: {len(ch):,}")

# ── 3. Decode WKB geometry ───────────────────────────────────────────────────
print("Decoding WKB geometry …")
ch['geometry'] = ch['geom'].apply(lambda b: wkb.loads(bytes(b)))
gdf = gpd.GeoDataFrame(ch, geometry='geometry', crs="EPSG:3035")

# ── 4. Calculate Centroids & Reproject to WGS84 ──────────────────────────────
print("Calculating centroids and reprojecting EPSG:3035 → EPSG:4326 (WGS84) …")

# Calculate centroid BEFORE projecting to avoid the GeoPandas UserWarning
# and to get the true mathematical center of the equal-area grid cell.
centroids_3035 = gdf.geometry.centroid

# Reproject both the main polygons and the centroids to WGS84
gdf = gdf.to_crs("EPSG:4326")
centroids_4326 = centroids_3035.to_crs("EPSG:4326")

# Extract safe lat/lon coordinates from the reprojected point geometries
gdf['longitude'] = centroids_4326.x   # x = easting = longitude in WGS84
gdf['latitude']  = centroids_4326.y   # y = northing = latitude in WGS84

# ── 5. Sanity check coordinates ──────────────────────────────────────────────
lat_ok = gdf['latitude'].between(45.0, 48.5)
lon_ok = gdf['longitude'].between(5.0, 11.0)
bad = (~lat_ok | ~lon_ok).sum()

if bad > 0:
    print(f"WARNING: {bad} cells outside Switzerland WGS84 bounds — dropping.")
    gdf = gdf[lat_ok & lon_ok].copy()

# This will no longer print NaN because the DataFrame won't be empty
print(f"Coordinate range check:")
print(f"  latitude  min={gdf['latitude'].min():.4f}  max={gdf['latitude'].max():.4f}  (expect ~45.8–47.9)")
print(f"  longitude min={gdf['longitude'].min():.4f}  max={gdf['longitude'].max():.4f}  (expect ~5.9–10.5)")

# ── 6. Keep only useful columns ───────────────────────────────────────────────
keep = ['GRD_ID', 'T', 'LAND_SURFACE', 'POPULATED', 'latitude', 'longitude', 'geometry']
gdf_out = gdf[keep].rename(columns={'T': 'pop_total'})

# Drop unpopulated cells to keep file lean
gdf_out = gdf_out[gdf_out['pop_total'] > 0].copy()
print(f"Populated cells retained: {len(gdf_out):,}")

# ── 7. Export ─────────────────────────────────────────────────────────────────
Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
print(f"Writing to {OUT_PATH} …")
gdf_out.to_file(OUT_PATH, driver="GeoJSON")
print(f"✅ Done → {OUT_PATH}")
print(f"\nSample row:")
print(gdf_out[['GRD_ID', 'pop_total', 'latitude', 'longitude']].head(3).to_string())
