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


def osrm_distance_matrix(points: list[tuple]) -> np.ndarray | None:
    """
    Full road-network distance matrix (km) between all `points` [(lat, lon), ...].

    Issues a single OSRM /table request over all points (≤ max-table-size).
    Unreachable pairs come back as NaN. Returns None on any failure so the
    caller can fall back to straight-line distances.
    """
    n = len(points)
    if n < 2:
        return np.zeros((n, n), dtype=np.float64)

    url = (
        f"{settings.osrm_url}/table/v1/driving/{_lonlat(points)}"
        f"?annotations=distance"
    )
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        raw = r.json().get("distances")
        if raw is None:
            return None
        # OSRM returns null for unreachable pairs → NaN (handled by caller)
        dist_m = np.array(
            [[np.nan if v is None else v for v in row] for row in raw],
            dtype=np.float64,
        )
        return dist_m / 1000.0
    except Exception as e:
        logger.warning(f"OSRM distance matrix failed ({e}), caller will fall back")
        return None


def osrm_distance_duration_matrix(points: list[tuple]) -> tuple[np.ndarray | None, np.ndarray | None]:
    """Full road-network **distance (km)** AND **travel-time (h)** matrices between
    all ``points`` [(lat, lon), ...] in a single OSRM ``/table`` request.

    The duration matrix carries OSRM's real per-segment road speeds (motorway vs.
    urban vs. mountain pass), so a 10 km city leg takes longer than a 10 km
    motorway leg. Step 4 uses this as the *free-flow* time base, which makes the
    time objective genuinely diverge from pure distance (a leg can be short yet
    slow). Unreachable pairs come back as NaN; returns ``(None, None)`` on failure
    so the caller falls back to ``distance / configured-speed``.
    """
    n = len(points)
    if n < 2:
        z = np.zeros((n, n), dtype=np.float64)
        return z, z.copy()

    url = (
        f"{settings.osrm_url}/table/v1/driving/{_lonlat(points)}"
        f"?annotations=distance,duration"
    )
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        data = r.json()
        raw_d = data.get("distances")
        raw_t = data.get("durations")
        if raw_d is None or raw_t is None:
            return None, None
        dist_m = np.array([[np.nan if v is None else v for v in row] for row in raw_d], dtype=np.float64)
        time_s = np.array([[np.nan if v is None else v for v in row] for row in raw_t], dtype=np.float64)
        return dist_m / 1000.0, time_s / 3600.0
    except Exception as e:
        logger.warning(f"OSRM distance/duration matrix failed ({e}), caller will fall back")
        return None, None


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
