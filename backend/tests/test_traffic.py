"""
Tests for the time-of-day traffic model (services/traffic) — the deterministic
congestion simulation that feeds the time objective when no live TomTom feed is
configured.
"""
from __future__ import annotations

from app.services import traffic


def test_peaks_are_higher_than_offpeak():
    morning = traffic.congestion_at(8.0)
    evening = traffic.congestion_at(17.0)
    midday  = traffic.congestion_at(12.5)
    night   = traffic.congestion_at(3.0)
    assert morning > midday > night
    assert evening > midday
    assert night == 1.0            # free flow at night
    assert morning > 1.4           # calibrated morning peak


def test_peak_intensity_scales_surcharge_only():
    # intensity 0 → no congestion anywhere; 2× → double the surcharge above 1.0.
    assert traffic.congestion_at(8.0, peak_intensity=0.0) == 1.0
    base = traffic.congestion_at(8.0, peak_intensity=1.0) - 1.0
    doubled = traffic.congestion_at(8.0, peak_intensity=2.0) - 1.0
    assert abs(doubled - 2 * base) < 1e-9


def test_shift_average_within_bounds():
    avg = traffic.shift_average(8.0, 8.0)
    assert 1.0 < avg < 1.6          # morning-to-afternoon shift includes both peaks


def test_effective_factor_off_uses_static():
    assert traffic.effective_factor(enabled=False, static_factor=1.25) == 1.25


def test_effective_factor_on_uses_simulation():
    f = traffic.effective_factor(enabled=True, static_factor=1.0, shift_start=8.0, shift_hours=8.0)
    assert f > 1.0                  # the simulated shift is congested on average


def test_resolve_static_when_disabled():
    ctx = traffic.resolve({"live_traffic_enabled": "0", "traffic_factor": "1.3"})
    assert ctx["source"] == "static"
    assert ctx["effective_factor"] == 1.3
    assert ctx["enabled"] is False


def test_resolve_simulation_when_enabled():
    ctx = traffic.resolve({"live_traffic_enabled": "1", "traffic_mode": "simulation",
                           "shift_start": "8.0", "shift_hours": "8.0"})
    assert ctx["source"] == "simulation"
    assert ctx["effective_factor"] > 1.0
    assert len(ctx["profile"]) == 24
