"""
Tests for the optimisation-value metric (services/metrics) — the savings of the
multi-stop optimisation versus the naive individual-delivery baseline.
"""
from __future__ import annotations

from app.services.metrics import compute_baseline_savings


class _Route:
    def __init__(self, stops, km, cost, hours, co2):
        self.stops = stops
        self.total_km = km
        self.total_cost_chf = cost
        self.total_hours = hours
        self.co2_kg = co2


VEH = {"name": "Sprinter", "cost_per_km": 0.38, "co2_g_per_km": 185.0, "driver_chf_h": 45.0}
DIST = {1: 8.0, 2: 10.0, 3: 12.0}   # hub→pharmacy km
TIME = {1: 0.13, 2: 0.16, 3: 0.20}


def test_savings_consolidation_reduces_km_and_co2():
    # One route delivering all three; baseline = 2×(8+10+12) = 60 km.
    routes = [_Route([1, 2, 3], km=40.0, cost=60.0, hours=1.2, co2=7.4)]
    s = compute_baseline_savings(routes, DIST, TIME, VEH)
    assert s["baseline_km"] == 60.0
    assert s["optimized_km"] == 40.0
    assert s["saved_km"] == 20.0
    assert s["saved_km_pct"] == round(100 * 20 / 60, 1)
    # CO₂ scales with distance → same percentage as km.
    assert s["saved_co2_pct"] == s["saved_km_pct"]
    assert s["pharmacies"] == 3
    assert s["baseline_vehicle"] == "Sprinter"


def test_savings_none_without_routes_or_vehicle():
    assert compute_baseline_savings([], DIST, TIME, VEH) is None
    assert compute_baseline_savings([_Route([1], 5, 5, 0.2, 1)], DIST, TIME, None) is None


def test_savings_ignores_non_int_stops():
    # Backbone-style hub-name stops must not be counted as pharmacies.
    routes = [_Route(["VZ_1", "mVZ_2"], km=10.0, cost=12.0, hours=0.3, co2=2.0)]
    assert compute_baseline_savings(routes, DIST, TIME, VEH) is None
