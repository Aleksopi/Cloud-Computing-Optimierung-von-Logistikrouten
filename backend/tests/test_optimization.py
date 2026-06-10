"""
Tests for the Step-4 route-optimisation core (a4_routes).

All tests run **offline** — no OSRM, no database, no network. The OSRM matrix
fetch is monkeypatched with a deterministic in-memory road network so we can
assert exact optimisation behaviour: the generalised-cost objective, the
capacity / range / shift / opening-hours constraints and the fact that the three
optimisation weights produce genuinely different routes.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.pipeline import a4_routes as a4


# ── Fixtures / helpers ──────────────────────────────────────────────────────────

DEPOT = (46.9480, 7.4474)  # Bern


def _vehicle(**over) -> dict:
    base = dict(name="Sprinter", capacity=15, range_km=350.0, cost_per_km=0.38,
                co2_g_per_km=185.0, speed_kmh=65.0, driver_chf_h=45.0,
                service_min=20, max_per_hub=5, restock_threshold=5)
    base.update(over)
    return base


def _opt(**over) -> dict:
    base = dict(weight_cost=0.40, weight_time=0.35, weight_env=0.25, co2_shadow=0.12,
                shift_start=8.0, shift_hours=8.0, traffic_factor=1.0, fallback_source="static")
    base.update(over)
    return base


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Never hit OSRM for geometry; default to Haversine distances + no durations."""
    monkeypatch.setattr(a4, "_road_geometry", lambda wps: wps)
    monkeypatch.setattr(a4, "osrm_distance_duration_matrix",
                        lambda points: (a4._hav_matrix([(la, lo) for la, lo in points]), None))


def _fake_matrix(speed_map: dict[tuple[int, int], float], default_speed: float = 60.0):
    """Build an OSRM-replacement returning (haversine distance, duration) where
    selected edges get a custom road speed (km/h) — to make time ≠ distance."""
    def _f(points):
        d = a4._hav_matrix([(la, lo) for la, lo in points])
        dur = d / default_speed
        for (i, j), spd in speed_map.items():
            dur[i, j] = d[i, j] / spd
            dur[j, i] = dur[i, j]
        return d, dur
    return _f


# ── Normalisation ────────────────────────────────────────────────────────────────

def test_nrm_basic():
    assert a4._nrm(5.0, [5.0, 10.0]) == 0.0
    assert a4._nrm(10.0, [5.0, 10.0]) == 1.0
    assert a4._nrm(7.5, [5.0, 10.0]) == 0.5
    # All-equal candidate set → 0 (no leverage), never a division by zero.
    assert a4._nrm(3.0, [3.0, 3.0]) == 0.0


# ── Generalised-cost stop score ──────────────────────────────────────────────────

def test_stop_score_isolated_objectives():
    """Each pure weight selects the candidate minimising its own real quantity."""
    costs = [10.0, 20.0, 5.0]   # cheapest = index 2
    times = [1.0, 0.5, 2.0]     # fastest  = index 1
    co2s  = [9.0, 3.0, 7.0]     # greenest = index 1

    def best(w):
        idxs = range(len(costs))
        return min(idxs, key=lambda i: a4._weighted_stop_score(
            costs[i], times[i], co2s[i], costs, times, co2s, w))

    assert best(_opt(weight_cost=1, weight_time=0, weight_env=0)) == 2
    assert best(_opt(weight_cost=0, weight_time=1, weight_env=0)) == 1
    assert best(_opt(weight_cost=0, weight_time=0, weight_env=1)) == 1


# ── Vehicle-order weighting ───────────────────────────────────────────────────────

def test_vehicle_order_follows_weights():
    veh = [
        _vehicle(name="Cheap", cost_per_km=0.30, speed_kmh=60.0, co2_g_per_km=200.0),
        _vehicle(name="Fast",  cost_per_km=0.90, speed_kmh=100.0, co2_g_per_km=250.0),
        _vehicle(name="Green", cost_per_km=0.60, speed_kmh=70.0,  co2_g_per_km=100.0),
    ]
    cost_first = a4._weighted_vehicle_order(veh, {"weight_cost": 1, "weight_time": 0, "weight_env": 0})
    time_first = a4._weighted_vehicle_order(veh, {"weight_cost": 0, "weight_time": 1, "weight_env": 0})
    env_first  = a4._weighted_vehicle_order(veh, {"weight_cost": 0, "weight_time": 0, "weight_env": 1})
    assert cost_first[0]["name"] == "Cheap"
    assert time_first[0]["name"] == "Fast"
    assert env_first[0]["name"] == "Green"


# ── End-to-end greedy VRP (Haversine fallback) ────────────────────────────────────

def _stops(*specs):
    out = []
    for i, (lat, lon, dem) in enumerate(specs, start=1):
        out.append(dict(id=i, lat=lat, lon=lon, demand=dem, open_hour=0.0, close_hour=24.0))
    return out


def test_vrp_serves_all_feasible_stops():
    stops = _stops((46.99, 7.50, 2), (47.05, 7.60, 3), (46.90, 7.40, 1))
    routes, unrouted = a4._solve_vrp("VZ_1", *DEPOT, stops, [_vehicle()], _opt())
    served = [sid for r in routes for sid in r["stops"]]
    assert sorted(served) == [1, 2, 3]
    assert unrouted == []
    for r in routes:
        # Tour starts and ends at the depot, accrues positive cost/co2/time.
        assert r["stop_coords"][0] == [DEPOT[1], DEPOT[0]]
        assert r["stop_coords"][-1] == [DEPOT[1], DEPOT[0]]
        assert r["total_cost_chf"] > 0 and r["co2_kg"] > 0 and r["total_hours"] > 0


def test_vrp_respects_capacity_per_vehicle():
    """A single vehicle (cap 5) cannot carry total demand 9 in one load → it must
    deploy a second vehicle (max_per_hub ≥ 2) and every route stays within cap."""
    stops = _stops((46.99, 7.50, 3), (47.02, 7.55, 3), (46.95, 7.46, 3))
    veh = [_vehicle(capacity=5, max_per_hub=4)]
    routes, unrouted = a4._solve_vrp("VZ_1", *DEPOT, stops, veh, _opt())
    assert unrouted == []
    assert len(routes) >= 2
    for r in routes:
        assert r["total_items"] <= 5


def test_vrp_demand_exceeds_capacity_is_unrouted_with_reason():
    stops = _stops((46.99, 7.50, 99))  # demand 99 > any capacity
    veh = [_vehicle(capacity=15, max_per_hub=3)]
    routes, unrouted = a4._solve_vrp("VZ_1", *DEPOT, stops, veh, _opt())
    assert routes == []
    assert len(unrouted) == 1
    assert unrouted[0]["reason"] == "Bedarf übersteigt Fahrzeugkapazität"


def test_vrp_out_of_range_is_unrouted_with_reason():
    # A stop ~94 km away; round trip 188 km > 50 km range.
    stops = _stops((47.3769, 8.5417, 1))  # Zürich
    veh = [_vehicle(range_km=50.0, max_per_hub=3)]
    routes, unrouted = a4._solve_vrp("VZ_1", *DEPOT, stops, veh, _opt())
    assert routes == []
    assert unrouted[0]["reason"] == "Entfernung übersteigt Fahrzeugreichweite"


def test_vrp_opening_hours_block_late_stop():
    # Stop closes at 08:05; with shift_start 08:00 and a long drive it can't be served.
    stops = [dict(id=1, lat=47.20, lon=7.80, demand=1, open_hour=0.0, close_hour=8.05)]
    veh = [_vehicle(max_per_hub=2)]
    routes, unrouted = a4._solve_vrp("VZ_1", *DEPOT, stops, veh, _opt(shift_start=8.0))
    assert routes == []
    assert unrouted[0]["reason"] == "Außerhalb der Öffnungszeiten erreichbar"


def test_time_weight_changes_route_with_real_road_times(monkeypatch):
    """With OSRM-style road times, minimising TIME yields a different (faster)
    sequence than minimising DISTANCE — proving the time objective is not a
    distance proxy. Stop A is near but on a slow road; B is farther but fast."""
    A = dict(id=1, lat=46.97, lon=7.47, demand=1, open_hour=0.0, close_hour=24.0)  # ~2.7 km
    B = dict(id=2, lat=47.04, lon=7.55, demand=1, open_hour=0.0, close_hour=24.0)  # ~12 km
    # node 1 = A (slow 15 km/h), node 2 = B (fast 110 km/h)
    monkeypatch.setattr(a4, "osrm_distance_duration_matrix",
                        _fake_matrix({(0, 1): 15.0, (0, 2): 110.0}))

    def first_stop(w):
        r, _ = a4._solve_vrp("VZ_1", *DEPOT, [dict(A), dict(B)], [_vehicle()], w)
        return r[0]["stops"][0]

    eco  = first_stop(_opt(weight_cost=0, weight_time=0, weight_env=1))  # distance
    time = first_stop(_opt(weight_cost=0, weight_time=1, weight_env=0))  # road time
    assert eco == 1   # nearest by distance = A
    assert time == 2  # fastest by road time = B
    assert eco != time
