"""
TomTom Traffic API integration — the **live** counterpart to the time-of-day
simulation in ``traffic.py``.

Two endpoints are used:

* **Traffic Flow Segment Data** — current vs. free-flow speed at a road point.
  Sampled over a handful of representative Swiss locations to derive a single
  live congestion factor (``freeFlowSpeed / currentSpeed``). Cheap, cached, and
  used both for UI indicators and as a fallback factor.

* **Matrix Routing v2** — traffic-aware origin×destination travel times. Feeds
  the VRP solver in Step 4 with real drive times per hub matrix.

API-key resolution follows a **file-first** policy: a key configured via the
environment / ``.env`` (``settings.tomtom_api_key``) always wins over a key
entered through the website (stored in ``SystemConfig``). Every network call is
wrapped so a failure degrades gracefully to OSRM / the simulation — TomTom never
crashes the pipeline.
"""
from __future__ import annotations

import logging
import time

import numpy as np
import requests

from app.config import settings

logger = logging.getLogger(__name__)

# Flow Segment Data sync limit is generous; the Matrix v2 *sync* endpoint caps a
# single request at 700 cells (origins × destinations).
_MATRIX_MAX_CELLS = 700

# Representative Swiss road points (motorway + city centres) for the flow factor.
_FLOW_SAMPLE_POINTS: list[tuple[float, float]] = [
    (47.3769, 8.5417),   # Zürich
    (46.9480, 7.4474),   # Bern
    (46.2044, 6.1432),   # Genf
    (47.5596, 7.5886),   # Basel
    (47.0502, 8.3093),   # Luzern
]

# ── API-key resolution (file-first) ─────────────────────────────────────────────

def resolve_key(db_value: str | None) -> str | None:
    """Effective key: env/.env wins over the website-entered DB value."""
    return (settings.tomtom_api_key or (db_value or "")).strip() or None


def key_source(db_value: str | None) -> str:
    """Where the effective key comes from: 'file', 'db' or 'none'."""
    if settings.tomtom_api_key.strip():
        return "file"
    if (db_value or "").strip():
        return "db"
    return "none"


def mask(key: str | None) -> str:
    """Masked key for display, e.g. '••••wxyz'. Never reveals the full key."""
    if not key:
        return ""
    tail = key[-4:] if len(key) >= 4 else key
    return "••••" + tail


# ── Traffic Flow Segment Data → live congestion factor ──────────────────────────

_flow_cache: dict[str, tuple[float, float]] = {}  # key → (factor, expires_at)
_FLOW_TTL_S = 120.0  # TomTom refreshes flow ~every 2 min; cache to respect limits


def flow_congestion_factor(key: str | None) -> float | None:
    """Mean live congestion factor (>1.0 = slower than free flow) over the sample
    points, or ``None`` if unavailable. Cached for ``_FLOW_TTL_S`` seconds."""
    if not key:
        return None

    now = time.monotonic()
    cached = _flow_cache.get(key)
    if cached and cached[1] > now:
        return cached[0]

    ratios: list[float] = []
    for lat, lon in _FLOW_SAMPLE_POINTS:
        url = (
            "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
            f"?point={lat},{lon}&key={key}"
        )
        try:
            r = requests.get(url, timeout=6)
            r.raise_for_status()
            fd = r.json().get("flowSegmentData", {})
            current = fd.get("currentSpeed") or 0
            freeflow = fd.get("freeFlowSpeed") or 0
            if current > 0 and freeflow > 0:
                ratios.append(freeflow / current)
        except Exception as exc:  # noqa: BLE001 — degrade gracefully
            logger.warning(f"[TomTom] flow call failed for {lat},{lon}: {exc}")

    if not ratios:
        return None
    factor = round(max(1.0, sum(ratios) / len(ratios)), 3)
    _flow_cache[key] = (factor, now + _FLOW_TTL_S)
    logger.info(f"[TomTom] live congestion factor {factor} (n={len(ratios)})")
    return factor


# ── Matrix Routing v2 → traffic-aware travel-time matrix ────────────────────────

def _matrix_request(key: str, origins: list[tuple[float, float]],
                    destinations: list[tuple[float, float]]) -> np.ndarray | None:
    """One Matrix Routing v2 sync call → durations (hours), shape (len(o), len(d)).

    ``origins``/``destinations`` are (lat, lon). Returns ``None`` on any failure;
    individual unreachable pairs come back as NaN."""
    url = f"https://api.tomtom.com/routing/matrix/2?key={key}"
    body = {
        "origins":      [{"point": {"latitude": la, "longitude": lo}} for la, lo in origins],
        "destinations": [{"point": {"latitude": la, "longitude": lo}} for la, lo in destinations],
        "options": {"departAt": "now", "traffic": "live", "travelMode": "car"},
    }
    try:
        r = requests.post(url, json=body, timeout=30)
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[TomTom] matrix call failed ({exc})")
        return None

    out = np.full((len(origins), len(destinations)), np.nan, dtype=np.float64)
    for cell in data:
        i = cell.get("originIndex")
        j = cell.get("destinationIndex")
        summ = cell.get("routeSummary") or {}
        secs = summ.get("travelTimeInSeconds")
        if i is None or j is None or secs is None:
            continue
        out[i, j] = secs / 3600.0
    return out


def matrix_durations_h(key: str | None, points: list[tuple[float, float]]) -> np.ndarray | None:
    """Square traffic-aware travel-time matrix (hours) over ``points`` [(lat, lon), …].

    Chunks destinations so every request stays ≤ ``_MATRIX_MAX_CELLS`` cells.
    Returns ``None`` if the key is missing or *any* chunk fails (caller falls
    back to OSRM/speed-based times for the whole matrix)."""
    n = len(points)
    if not key or n < 2:
        return None

    # All origins per request; batch destinations to respect the cell cap.
    batch = max(1, _MATRIX_MAX_CELLS // n)
    cols: list[np.ndarray] = []
    for start in range(0, n, batch):
        dests = points[start:start + batch]
        chunk = _matrix_request(key, points, dests)
        if chunk is None:
            return None
        cols.append(chunk)

    mat = np.hstack(cols)
    np.fill_diagonal(mat, 0.0)
    return mat
