import json
import logging
import os

import requests

logger = logging.getLogger(__name__)

_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_OVERPASS_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="CH"]->.ch;
node(area.ch)["amenity"="pharmacy"];
out body;
"""


def download_pharmacies(output_path: str, max_count: int = 400):
    logger.info("Downloading pharmacy data from Overpass API...")
    r = requests.post(_OVERPASS_URL, data={"data": _OVERPASS_QUERY}, timeout=200)
    r.raise_for_status()
    elements = r.json().get("elements", [])

    features = []
    for el in elements:
        if "lat" not in el or "lon" not in el:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
                "properties": {"@id": f"node/{el['id']}", **el.get("tags", {})},
            }
        )

    geojson = {"type": "FeatureCollection", "features": features[:max_count]}
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson, f)
    logger.info(f"Downloaded {len(features)} pharmacies → {output_path}")
