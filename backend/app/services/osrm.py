import logging

import numpy as np
import requests

from app.config import settings

logger = logging.getLogger(__name__)


def _lonlat(coords: list[tuple]) -> str:
    """[(lat, lon), ...] → 'lon,lat;lon,lat;...' (OSRM expects lon,lat)"""
    return ";".join(f"{lon},{lat}" for lat, lon in coords)


def osrm_table(sources: list[tuple], destinations: list[tuple]) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (distances_km, durations_h) both shape (n_sources, n_destinations).
    Sources and destinations are (lat, lon) tuples.
    """
    all_coords = sources + destinations
    n_src = len(sources)
    n_dst = len(destinations)

    src_param = ";".join(str(i) for i in range(n_src))
    dst_param = ";".join(str(i) for i in range(n_src, n_src + n_dst))

    url = (
        f"{settings.osrm_url}/table/v1/driving/{_lonlat(all_coords)}"
        f"?sources={src_param}&destinations={dst_param}"
        f"&annotations=distance,duration"
    )

    r = requests.get(url, timeout=120)
    r.raise_for_status()
    data = r.json()

    dist_m = np.array(data["distances"], dtype=np.float64)
    time_s = np.array(data["durations"], dtype=np.float64)

    # Replace None/NaN with large fallback
    dist_m = np.where(np.isnan(dist_m), 1e9, dist_m)
    time_s = np.where(np.isnan(time_s), 1e9, time_s)

    return dist_m / 1000.0, time_s / 3600.0


def osrm_geometry(origin: tuple, destination: tuple) -> list[list[float]]:
    """
    Returns [[lon, lat], ...] for the driving route. Falls back to straight line on error.
    origin/destination are (lat, lon) tuples.
    """
    url = (
        f"{settings.osrm_url}/route/v1/driving/"
        f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
        f"?overview=full&geometries=geojson"
    )
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        return r.json()["routes"][0]["geometry"]["coordinates"]
    except Exception as e:
        logger.warning(f"OSRM geometry failed ({e}), using straight line")
        return [[origin[1], origin[0]], [destination[1], destination[0]]]
