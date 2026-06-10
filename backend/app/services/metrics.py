"""
Optimisation-value metrics — dependency-light (no FastAPI/DB) so they can be
unit-tested in isolation and reused by the results API.
"""
from __future__ import annotations


def compute_baseline_savings(
    last_mile_routes: list,
    dist_by_pid: dict[int, float],
    time_by_pid: dict[int, float],
    baseline_vehicle: dict | None,
) -> dict | None:
    """Quantify what the multi-stop route optimisation actually saves on the last
    mile, versus the naive **individual-delivery baseline** (one dedicated
    there-and-back trip per pharmacy, no consolidation) — the classic reference
    point for the value of vehicle routing.

    For every pharmacy actually served by a last-mile route the baseline drives
    ``2 × hub→pharmacy`` km and hours (out and back). Cost and CO₂ use the
    cheapest delivery vehicle, so the baseline is the *best case* for "no
    optimisation" and the reported savings are conservative.

    Returns absolute and percentage savings in km, CHF, h and kg CO₂, or ``None``
    when there is nothing to compare (no routes / no fleet)."""
    if not last_mile_routes or baseline_vehicle is None:
        return None

    delivered: set[int] = set()
    for r in last_mile_routes:
        for sid in (r.stops or []):
            if isinstance(sid, int):
                delivered.add(sid)
    if not delivered:
        return None

    cost_km  = float(baseline_vehicle.get("cost_per_km") or 0.0)
    co2_g_km = float(baseline_vehicle.get("co2_g_per_km") or 0.0)
    driver_h = float(baseline_vehicle.get("driver_chf_h") or 0.0)

    base_km = base_h = 0.0
    for pid in delivered:
        base_km += 2.0 * float(dist_by_pid.get(pid, 0.0))
        base_h  += 2.0 * float(time_by_pid.get(pid, 0.0))
    base_cost = base_km * cost_km + base_h * driver_h
    base_co2  = base_km * co2_g_km / 1000.0

    opt_km   = sum(r.total_km       or 0.0 for r in last_mile_routes)
    opt_cost = sum(r.total_cost_chf or 0.0 for r in last_mile_routes)
    opt_h    = sum(r.total_hours    or 0.0 for r in last_mile_routes)
    opt_co2  = sum(r.co2_kg         or 0.0 for r in last_mile_routes)

    def _pct(saved: float, base: float) -> float:
        return round(100.0 * saved / base, 1) if base > 1e-9 else 0.0

    return {
        "baseline_vehicle":  baseline_vehicle.get("name"),
        "pharmacies":        len(delivered),
        "baseline_km":       round(base_km, 1),
        "baseline_cost_chf": round(base_cost, 0),
        "baseline_hours":    round(base_h, 1),
        "baseline_co2_kg":   round(base_co2, 1),
        "optimized_km":       round(opt_km, 1),
        "optimized_cost_chf": round(opt_cost, 0),
        "optimized_hours":    round(opt_h, 1),
        "optimized_co2_kg":   round(opt_co2, 1),
        "saved_km":          round(base_km - opt_km, 1),
        "saved_cost_chf":    round(base_cost - opt_cost, 0),
        "saved_hours":       round(base_h - opt_h, 1),
        "saved_co2_kg":      round(base_co2 - opt_co2, 1),
        "saved_km_pct":      _pct(base_km - opt_km, base_km),
        "saved_cost_pct":    _pct(base_cost - opt_cost, base_cost),
        "saved_hours_pct":   _pct(base_h - opt_h, base_h),
        "saved_co2_pct":     _pct(base_co2 - opt_co2, base_co2),
    }
