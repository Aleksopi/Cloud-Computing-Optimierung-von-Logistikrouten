"""
TomTom Traffic API integration — the **live** counterpart to the time-of-day
simulation in ``traffic.py``.

Two endpoints are used:

* **Traffic Flow Segment Data** — current vs. free-flow speed at a road point.
  Sampled over a handful of representative Swiss locations to derive a single
  live congestion factor (``freeFlowSpeed / currentSpeed``). Cheap, cached, and
  used for UI indicators and as the live scalar factor.

* **Matrix Routing v2** — traffic-aware origin×destination travel times. Feeds
  the VRP solver in Step 4 with real drive times per hub matrix.

API-key resolution: a key entered through the website (stored in
``SystemConfig``) **overrides** the ``.env`` key; if none is entered the
``.env`` key (``settings.tomtom_api_key``) is used automatically. The ``.env``
key thus acts as an editable default.

Network calls return ``(value, error)`` tuples — ``error`` is a short German
message (or ``None`` on success) so the API/UI can show a popup distinguishing
an invalid key from a reached rate limit. In **live mode** there is no silent
fallback to the simulation: a failure degrades to free-flow times and surfaces
the error.
"""
from __future__ import annotations

import logging
import threading
import time

import numpy as np
import requests

from app.config import settings

logger = logging.getLogger(__name__)

# Matrix v2 *sync* with live traffic (departAt=now) caps a request at 100 cells
# (e.g. 10×10) — much lower than the 700 for non-traffic matrices. We tile the
# full n×n matrix in ≤100-cell blocks.
_MATRIX_MAX_CELLS = 100

# TomTom Matrix v2 with live traffic allows only ~1 QPS on the developer plan.
# Without a semaphore, the ThreadPoolExecutor in a4_routes.py fires 8 hub threads
# simultaneously, each sending multiple tiled requests → immediate HTTP 429.
_MATRIX_SEMAPHORE = threading.Semaphore(1)

# Representative Swiss road points (motorway + city centres) for the flow factor.
_FLOW_SAMPLE_POINTS: list[tuple[float, float]] = [
    (47.3769, 8.5417),   # Zürich
    (46.9480, 7.4474),   # Bern
    (46.2044, 6.1432),   # Genf
    (47.5596, 7.5886),   # Basel
    (47.0502, 8.3093),   # Luzern
]

# ── API-key resolution ──────────────────────────────────────────────────────────
# A website-entered key (DB) OVERRIDES the .env key; if none is entered the .env
# key is used automatically. This lets the .env key act as the default while
# still being editable/overridable from the UI.

def resolve_key(db_value: str | None) -> str | None:
    """Effective key: a website-entered DB key wins; otherwise the .env key."""
    db = (db_value or "").strip()
    if db:
        return db
    return settings.tomtom_api_key.strip() or None


def key_source(db_value: str | None) -> str:
    """Where the effective key comes from: 'db' (entered), 'file' (.env) or 'none'."""
    if (db_value or "").strip():
        return "db"
    if settings.tomtom_api_key.strip():
        return "file"
    return "none"


def mask(key: str | None) -> str:
    """Masked key for display, e.g. '••••wxyz'. Never reveals the full key."""
    if not key:
        return ""
    tail = key[-4:] if len(key) >= 4 else key
    return "••••" + tail


# ── Error classification ────────────────────────────────────────────────────────

def classify(status: int | None, exc: Exception | None = None) -> tuple[str, str]:
    """Map an HTTP status / exception to (error_type, German message)."""
    if status in (401, 403):
        return "invalid_key", "TomTom-API-Key ungültig oder nicht freigeschaltet."
    if status == 429:
        return "rate_limit", "TomTom-Ratenlimit erreicht (zu viele Anfragen oder Tageskontingent aufgebraucht)."
    if status is not None and status >= 500:
        return "server", f"TomTom-Serverfehler (HTTP {status})."
    if exc is not None:
        return "network", f"TomTom nicht erreichbar ({type(exc).__name__})."
    if status is not None:
        return "unknown", f"TomTom-Fehler (HTTP {status})."
    return "unknown", "Unbekannter TomTom-Fehler."


# ── Traffic Flow Segment Data → live congestion factor ──────────────────────────

_flow_cache: dict[str, tuple[float, float]] = {}  # key → (factor, expires_at)
_FLOW_TTL_S = 120.0  # TomTom refreshes flow ~every 2 min; cache to respect limits


def flow_congestion_factor(key: str | None) -> tuple[float | None, str | None]:
    """Mean live congestion factor (>1.0 = slower than free flow) over the sample
    points → ``(factor, None)``; on total failure ``(None, message)``.
    Cached for ``_FLOW_TTL_S`` seconds."""
    if not key:
        return None, "Kein TomTom-API-Key hinterlegt."

    now = time.monotonic()
    cached = _flow_cache.get(key)
    if cached and cached[1] > now:
        return cached[0], None

    ratios: list[float] = []
    last_status: int | None = None
    last_exc: Exception | None = None
    for lat, lon in _FLOW_SAMPLE_POINTS:
        url = (
            "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
            f"?point={lat},{lon}&key={key}"
        )
        try:
            r = requests.get(url, timeout=6)
            if not r.ok:
                last_status = r.status_code
                continue
            fd = r.json().get("flowSegmentData", {})
            current = fd.get("currentSpeed") or 0
            freeflow = fd.get("freeFlowSpeed") or 0
            if current > 0 and freeflow > 0:
                ratios.append(freeflow / current)
        except Exception as exc:  # noqa: BLE001 — degrade gracefully
            last_exc = exc
            logger.warning(f"[TomTom] flow call failed for {lat},{lon}: {exc}")

    if not ratios:
        _etype, msg = classify(last_status, last_exc)
        return None, msg
    factor = round(max(1.0, sum(ratios) / len(ratios)), 3)
    _flow_cache[key] = (factor, now + _FLOW_TTL_S)
    logger.info(f"[TomTom] live congestion factor {factor} (n={len(ratios)})")
    return factor, None


def probe(key: str | None) -> dict:
    """Single live test call for the settings 'Test'/save flow.
    Returns ``{ok, error_type, message, detail}`` where ``detail`` carries the
    full technical info (HTTP status + raw response) for a 'more info' view."""
    if not key:
        return {"ok": False, "error_type": "no_key",
                "message": "Kein TomTom-API-Key hinterlegt.",
                "detail": "Es ist weder in der .env noch über die Website ein Key gesetzt."}

    lat, lon = _FLOW_SAMPLE_POINTS[0]
    url = (
        "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
        f"?point={lat},{lon}&key={key}"
    )
    try:
        r = requests.get(url, timeout=8)
        if r.ok:
            fd = r.json().get("flowSegmentData", {})
            cur = fd.get("currentSpeed") or 0
            ff = fd.get("freeFlowSpeed") or 0
            factor = round(ff / cur, 2) if cur and ff else None
            msg = f"Verbindung OK · aktueller Faktor ×{factor}" if factor else "Verbindung OK"
            return {"ok": True, "error_type": None, "message": msg,
                    "detail": f"HTTP {r.status_code} · currentSpeed={cur}, freeFlowSpeed={ff}"}
        etype, msg = classify(r.status_code)
        snippet = (r.text or "").strip()[:400]
        return {"ok": False, "error_type": etype, "message": msg,
                "detail": f"HTTP {r.status_code} bei flowSegmentData\n{snippet}"}
    except Exception as exc:  # noqa: BLE001
        etype, msg = classify(None, exc)
        return {"ok": False, "error_type": etype, "message": msg,
                "detail": f"{type(exc).__name__}: {exc}"}


# ── Matrix Routing v2 → traffic-aware travel-time matrix ────────────────────────

# Cache successful hub matrices briefly so repeated Step-4 runs don't re-spend the
# (cell-billed) quota — live traffic barely changes within a few minutes.
_matrix_cache: dict[tuple, tuple[np.ndarray, float]] = {}
_MATRIX_TTL_S = 300.0


def _matrix_request(key: str, origins: list[tuple[float, float]],
                    destinations: list[tuple[float, float]]):
    """One Matrix Routing v2 sync call, serialised via _MATRIX_SEMAPHORE.
    Returns ``(matrix_hours, None)`` on success or ``(None, (status, exc))`` on failure.
    Individual unreachable pairs come back as NaN.

    On HTTP 429 (rate limit), retries up to 3 times with exponential backoff before
    giving up — this handles the ~1 QPS limit on the TomTom developer plan when
    multiple hub threads race for the same endpoint."""
    url = f"https://api.tomtom.com/routing/matrix/2?key={key}"
    body = {
        "origins":      [{"point": {"latitude": la, "longitude": lo}} for la, lo in origins],
        "destinations": [{"point": {"latitude": la, "longitude": lo}} for la, lo in destinations],
        # Matrix Routing v2: `traffic` is a STRING enum ("live"/"historical") and
        # "live" REQUIRES departAt — this exact combo is verified to return 200.
        "options": {"departAt": "now", "traffic": "live", "travelMode": "car"},
    }
    _RETRIES = 3
    _BACKOFF_S = [2.0, 5.0, 10.0]

    with _MATRIX_SEMAPHORE:
        for attempt in range(_RETRIES):
            try:
                r = requests.post(url, json=body, timeout=30)
                if r.status_code == 429 and attempt < _RETRIES - 1:
                    wait = _BACKOFF_S[attempt]
                    logger.warning(f"[TomTom] matrix 429 rate-limited, retry {attempt + 1}/{_RETRIES - 1} in {wait}s")
                    time.sleep(wait)
                    continue
                if not r.ok:
                    return None, (r.status_code, None)
                data = r.json().get("data", [])
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"[TomTom] matrix call failed ({exc})")
                return None, (None, exc)

            out = np.full((len(origins), len(destinations)), np.nan, dtype=np.float64)
            for cell in data:
                i = cell.get("originIndex")
                j = cell.get("destinationIndex")
                summ = cell.get("routeSummary") or {}
                secs = summ.get("travelTimeInSeconds")
                if i is None or j is None or secs is None:
                    continue
                out[i, j] = secs / 3600.0
            return out, None
        return None, (429, None)


def matrix_durations_h(key: str | None, points: list[tuple[float, float]]) -> tuple[np.ndarray | None, str | None]:
    """Square traffic-aware travel-time matrix (hours) over ``points`` [(lat, lon), …].

    Tiles the full n×n matrix in square blocks so each request stays within the
    live-traffic cell limit (``_MATRIX_MAX_CELLS``). Returns ``(matrix, None)`` or
    ``(None, message)`` if the key is missing or any block fails (caller then uses
    free-flow times for the whole matrix)."""
    n = len(points)
    if not key:
        return None, "Kein TomTom-API-Key hinterlegt."
    if n < 2:
        return None, None

    # Short-TTL cache keyed by the rounded point set (quota-friendly re-runs).
    ckey = tuple((round(la, 5), round(lo, 5)) for la, lo in points)
    now = time.monotonic()
    cached = _matrix_cache.get(ckey)
    if cached and cached[1] > now:
        return cached[0], None

    blk = max(1, int(_MATRIX_MAX_CELLS ** 0.5))   # 10 → 10×10 = 100 cells per request
    out = np.full((n, n), np.nan, dtype=np.float64)
    for i0 in range(0, n, blk):
        o = points[i0:i0 + blk]
        for j0 in range(0, n, blk):
            d = points[j0:j0 + blk]
            chunk, errinfo = _matrix_request(key, o, d)
            if chunk is None:
                status, exc = errinfo if errinfo else (None, None)
                _etype, msg = classify(status, exc)
                return None, msg
            out[i0:i0 + len(o), j0:j0 + len(d)] = chunk

    np.fill_diagonal(out, 0.0)
    _matrix_cache[ckey] = (out, now + _MATRIX_TTL_S)
    return out, None
