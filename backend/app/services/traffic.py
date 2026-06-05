"""
Traffic model for route optimisation — a time-of-day **simulation**, NOT a live
real-time traffic feed.

Real-time per-segment traffic feeds require a paid provider (TomTom/HERE) and
outbound internet — neither is available on the VPN-only deployment. Instead we
model congestion deterministically from the **time of day** using a calibrated
Swiss weekday commuter profile (morning + evening peak). This is self-contained,
reproducible and genuinely affects the optimisation:

    drive_time = free_flow_time × congestion_factor

When the traffic model is OFF the optimiser falls back to the static
``traffic_factor`` system-config value (default 1.0 = free flow).

The factor fed into Step 4 is the **mean congestion across the delivery shift**
(deterministic, so the summary can reproduce exactly what was used), while
``current_congestion`` exposes the modelled value for the current time of day
for UI indicators (still simulated, not measured).
"""
from __future__ import annotations

from datetime import datetime

# Relative congestion multiplier on free-flow travel time, indexed by clock hour.
# Calibrated to a typical Swiss weekday commuter pattern — two rush-hour peaks.
_HOURLY: dict[int, float] = {
    0: 1.00,  1: 1.00,  2: 1.00,  3: 1.00,  4: 1.02,  5: 1.08,
    6: 1.22,  7: 1.48,  8: 1.55,  9: 1.34, 10: 1.18, 11: 1.16,
    12: 1.22, 13: 1.18, 14: 1.15, 15: 1.24, 16: 1.42, 17: 1.56,
    18: 1.46, 19: 1.24, 20: 1.10, 21: 1.05, 22: 1.02, 23: 1.00,
}


def congestion_at(hour: float, peak_intensity: float = 1.0) -> float:
    """Interpolated congestion multiplier for an arbitrary hour (wraps at 24h).

    ``peak_intensity`` scales the surcharge *above* free flow:
    1.0 = calibrated default, 0.0 = no congestion, >1.0 = heavier than usual.
    """
    hour = hour % 24.0
    h0 = int(hour)
    h1 = (h0 + 1) % 24
    frac = hour - h0
    base = _HOURLY[h0] * (1.0 - frac) + _HOURLY[h1] * frac
    return 1.0 + (base - 1.0) * max(0.0, peak_intensity)


def shift_average(shift_start: float, shift_hours: float, peak_intensity: float = 1.0) -> float:
    """Mean congestion across the window [shift_start, shift_start + shift_hours]."""
    shift_hours = max(0.25, shift_hours)
    steps = max(1, int(round(shift_hours * 4)))  # 15-minute resolution
    total = sum(
        congestion_at(shift_start + (i + 0.5) * (shift_hours / steps), peak_intensity)
        for i in range(steps)
    )
    return total / steps


def effective_factor(
    *,
    enabled: bool,
    static_factor: float,
    shift_start: float = 8.0,
    shift_hours: float = 8.0,
    peak_intensity: float = 1.0,
) -> float:
    """Traffic factor Step 4 should apply to all drive times.

    Live ON  → mean congestion across the delivery shift.
    Live OFF → the static configured ``traffic_factor``.
    """
    if not enabled:
        return round(static_factor, 3)
    return round(shift_average(shift_start, shift_hours, peak_intensity), 3)


def current_congestion(peak_intensity: float = 1.0, now: datetime | None = None) -> float:
    """Live congestion multiplier for the current wall-clock moment."""
    now = now or datetime.now()
    return round(congestion_at(now.hour + now.minute / 60.0, peak_intensity), 3)


def hourly_profile(peak_intensity: float = 1.0) -> list[float]:
    """24 hourly congestion multipliers — for plotting the daily curve."""
    return [round(congestion_at(float(h), peak_intensity), 3) for h in range(24)]
