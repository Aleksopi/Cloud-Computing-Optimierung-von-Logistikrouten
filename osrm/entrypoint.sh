#!/bin/bash
set -e

PBF_FILE="/data/switzerland-260525-roads.osm.pbf"
OSRM_FILE="/data/switzerland-260525-roads.osrm"

if [ ! -f "$OSRM_FILE" ]; then
    echo "OSRM graph not found — processing from OSM data..."

    if [ ! -f "$PBF_FILE" ]; then
        echo "PBF not found — downloading Switzerland roads from Geofabrik (~170 MB)..."
        curl -L --progress-bar -o "$PBF_FILE" \
            "https://download.geofabrik.de/europe/switzerland-latest.osm.pbf"
    fi

    echo "Extracting road graph..."
    osrm-extract -p /opt/car.lua "$PBF_FILE"

    echo "Partitioning..."
    osrm-partition "$OSRM_FILE"

    echo "Customizing..."
    osrm-customize "$OSRM_FILE"

    echo "OSRM processing complete."
fi

echo "Starting OSRM routing engine..."
exec osrm-routed --algorithm=mld --max-table-size=500 "$OSRM_FILE"
