"""
a4_routes.py
============
Step 4: Hierarchical Swiss Freight Transport & Last-Mile VRP Optimizer
======================================================================
Orchestrates the two-tier distribution network across Switzerland.

Sub-Step 1: Hub-to-Hub Supply Chain Matrix (Multi-hop Dijkstra Paths)
  - Connects HQ, primary VZs, and decentralised mVZs into a logical network.
  - Generates shortest-path tracking for every ware according to source quotas.
    Source quotas: 60 % from HQ, 40 % from a random VZ.
  - Cost rates (CHF per ware per 100 km air-line):
      HQ  → VZ   : 10 CHF
      VZ  → VZ   : 12 CHF
      VZ  → mVZ  : 15 CHF
      mVZ → mVZ  : 15 CHF

Sub-Step 2: Last-Mile Capacitated Vehicle Routing Problem (CVRP)
  - Distributes wares from assigned regional hubs to targeted pharmacies.
  - Fleet rules (identical for VZ and mVZ per spec):
      EVans : 5–12 per hub | 150 km max range | 30 min service per stop
              capacity 30 wares per trip
              restock allowed after 15 delivered wares:
                → costs 60 min, grants +80 km range boost (once per trip)
      LKWs  : 1–3 per hub  | 600 km max range | 40 min service per stop
              no ware capacity limit
  - Hard shift limit : 8 h total (driving + service time + optional restock)
  - Both vehicle types are optimised simultaneously (mixed-fleet CVRP).
  - All routes drawn on the map object with rich hover tooltips:
      transported wares | restock at VZ (yes/no + time) | total time |
      total distance | vehicle type | cost (CHF)
  - Per-hub aggregated statistics printed after each hub completes.

Cost parameters:
  Backbone  — CHF per ware per 100 km air-line:
      HQ→VZ : 10  |  VZ→VZ : 12  |  VZ/mVZ→mVZ : 15
  Last-mile — per vehicle:
      LKW  : 50 CHF/h  +  30 CHF / 100 km road
      EVan : 50 CHF/h  +  20 CHF / 100 km road

Public surface (notebook calls one function):
  from a4_routes import plan_routes
  results = plan_routes(pharmacy_df, hubs_df, map_obj=map.drawInterface)
"""

from __future__ import annotations

import concurrent.futures
import logging
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
from geopy.distance import geodesic

logger = logging.getLogger("LogisticsLogger")


# =============================================================================
# CONSTANTS & DEFAULT COST TABLES
# =============================================================================

DEFAULT_BACKBONE_COSTS: Dict[str, float] = {
    "HQ_to_VZ":    10.0,
    "VZ_to_VZ":    12.0,
    "VZ_to_mVZ":   15.0,
    "mVZ_to_mVZ":  15.0,
}

DEFAULT_LASTMILE_COSTS: Dict[str, Dict[str, float]] = {
    "lkw":  {"per_hour": 50.0, "per_100km": 30.0},
    "evan": {"per_hour": 50.0, "per_100km": 20.0},
}

# Fleet limits (per spec)
_MAX_EVANS          = 12
_MIN_EVANS          = 5
_MAX_LKWS           = 3

# EVan constraints
_EVAN_CAP_WARES     = 30       # max wares per trip
_EVAN_MAX_KM        = 150.0    # base max range km
_EVAN_RESTOCK_AFTER = 15       # wares delivered before restock is allowed
_EVAN_RESTOCK_BOOST = 80.0     # extra km from one restock
_EVAN_RESTOCK_TIME  = 1.0      # hours consumed by restock
_EVAN_SERVICE_H     = 0.5      # 30 min per stop

# LKW constraints
_LKW_MAX_KM         = 600.0
_LKW_SERVICE_H      = 2 / 3    # 40 min per stop

# Shared
_MAX_SHIFT_H        = 8.0      # hard total shift limit (round-trip)

# Map colours
_EVAN_COLORS = [
    "#2ecc71", "#27ae60", "#1abc9c", "#16a085",
    "#00b894", "#55efc4", "#00cec9", "#6c5ce7",
    "#0984e3", "#74b9ff", "#a29bfe", "#fd79a8",
]
_LKW_COLORS = [
    "#e74c3c", "#c0392b", "#e67e22", "#d35400",
    "#e84393", "#9b59b6", "#8e44ad", "#f39c12",
]


# =============================================================================
# SECTION 0 — SHARED HELPERS
# =============================================================================

def _air_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Haversine air-line distance in km."""
    return geodesic(a, b).km


def _backbone_cost(
    origin_type: str,
    dest_type: str,
    wares: int,
    dist_km: float,
    cost_params: Dict[str, float],
) -> float:
    """CHF cost for one backbone ware movement (air-line distance)."""
    key  = f"{origin_type}_to_{dest_type}"
    rate = cost_params.get(key, cost_params.get("VZ_to_mVZ", 15.0))
    return wares * (dist_km / 100.0) * rate


def _lastmile_cost(
    vehicle_type: str,
    km: float,
    hours: float,
    cost_params: Dict[str, Dict[str, float]],
) -> float:
    """CHF cost for one vehicle's complete trip."""
    rates = cost_params.get(vehicle_type, cost_params["evan"])
    return hours * rates["per_hour"] + (km / 100.0) * rates["per_100km"]


# =============================================================================
# SECTION 1 — SUB-STEP 1: HUB BACKBONE SUPPLY NETWORK (DIJKSTRA)
# =============================================================================

def _optimize_hub_distribution(
    pharmacy_df: pd.DataFrame,
    hubs_df: pd.DataFrame,
    engine: Any,
    backbone_costs: Dict[str, float],
) -> Dict[str, Any]:
    """
    Build directed hub graph and route every ware via Dijkstra from its
    origin (HQ 60 % / random VZ 40 %) to its assigned delivery hub.

    Returns
    -------
    {
      "ware_paths"              : List[dict],
      "total_hub_distance_km"   : float,
      "total_backbone_cost_chf" : float,
    }
    """
    logger.info("[Step 4.1] Initializing topological hub supply graph…")

    if "hub_name" not in hubs_df.columns:
        hubs_df = hubs_df.reset_index().rename(columns={"index": "hub_name"})

    hub_locations: Dict[str, Tuple[float, float]] = {
        row["hub_name"]: (float(row["lat"]), float(row["lon"]))
        for _, row in hubs_df.iterrows()
    }
    hub_types: Dict[str, str] = {
        row["hub_name"]: row["type"]
        for _, row in hubs_df.iterrows()
    }

    hq_nodes  = [n for n, t in hub_types.items() if t == "HQ"]
    vz_nodes  = [n for n, t in hub_types.items() if t == "VZ"]
    mvz_nodes = [n for n, t in hub_types.items() if t == "mVZ"]

    if not hq_nodes:
        raise ValueError("No HQ node found in hubs_df.")
    primary_hq = hq_nodes[0]

    # Build directed graph
    G = nx.DiGraph()
    for name in hub_locations:
        G.add_node(name, type=hub_types[name])

    # HQ → every VZ
    for vz in vz_nodes:
        d, _ = engine.distance_and_time(
            hub_locations[primary_hq], hub_locations[vz], vehicle="lkw"
        )
        G.add_edge(primary_hq, vz, weight=d)

    # VZ ↔ VZ (bi-directional)
    for i, vz1 in enumerate(vz_nodes):
        for vz2 in vz_nodes[i + 1:]:
            d, _ = engine.distance_and_time(
                hub_locations[vz1], hub_locations[vz2], vehicle="lkw"
            )
            G.add_edge(vz1, vz2, weight=d)
            G.add_edge(vz2, vz1, weight=d)

    # Nearest VZ → each mVZ (bi-directional)
    for mvz in mvz_nodes:
        best_vz, min_d = None, float("inf")
        for vz in vz_nodes:
            d, _ = engine.distance_and_time(
                hub_locations[vz], hub_locations[mvz], vehicle="van"
            )
            if d < min_d:
                min_d, best_vz = d, vz
        if best_vz:
            G.add_edge(best_vz, mvz, weight=min_d)
            G.add_edge(mvz, best_vz, weight=min_d)

    logger.info("[Step 4.1] Routing wares via Dijkstra…")
    np.random.seed(42)

    ware_paths:          List[Dict] = []
    total_backbone_km   = 0.0
    total_backbone_cost = 0.0

    for pid, row in pharmacy_df.iterrows():
        n_wares    = int(row.get("demand_wares", 0))
        target_hub = row.get("assigned_hub")
        if n_wares <= 0 or not target_hub:
            continue

        for _ in range(n_wares):
            source = (
                primary_hq
                if np.random.rand() < 0.60
                else str(np.random.choice(vz_nodes))
            )
            try:
                path   = nx.dijkstra_path(G, source, target_hub, weight="weight")
                path_d = nx.dijkstra_path_length(G, source, target_hub, weight="weight")
            except nx.NetworkXNoPath:
                d, _ = engine.distance_and_time(
                    hub_locations[source], hub_locations[target_hub]
                )
                path, path_d = [source, target_hub], d

            total_backbone_km += path_d

            hop_cost = 0.0
            for ha, hb in zip(path[:-1], path[1:]):
                air = _air_km(hub_locations[ha], hub_locations[hb])
                hop_cost += _backbone_cost(
                    hub_types[ha], hub_types[hb], 1, air, backbone_costs
                )
            total_backbone_cost += hop_cost

            ware_paths.append({
                "pharmacy_id": pid,
                "origin":      source,
                "destination": target_hub,
                "path":        path,
                "distance_km": round(path_d, 2),
                "cost_chf":    round(hop_cost, 4),
            })

    logger.info(
        f"[Step 4.1] ✅ Backbone complete. "
        f"{len(ware_paths)} wares routed. "
        f"Cost: CHF {total_backbone_cost:,.2f}"
    )
    return {
        "ware_paths":              ware_paths,
        "total_hub_distance_km":   round(total_backbone_km, 2),
        "total_backbone_cost_chf": round(total_backbone_cost, 2),
    }


# =============================================================================
# SECTION 2 — SUB-STEP 2A: EVAN GREEDY TRIP BUILDER (with restock)
# =============================================================================

def _build_evan_trips(
    unserved:    List[str],
    depot:       Tuple[float, float],
    deliveries:  Dict[str, Any],
    engine:      Any,
    cost_params: Dict[str, Dict[str, float]],
) -> Tuple[List[Dict], List[str]]:
    """
    Greedy nearest-neighbour EVan route builder.

    Per-trip constraints:
      capacity  : _EVAN_CAP_WARES (30)
      range     : _EVAN_MAX_KM (150) + optional _EVAN_RESTOCK_BOOST (80)
      shift     : _MAX_SHIFT_H (8 h) including driving + service + restock
      restock   : triggered once per trip after _EVAN_RESTOCK_AFTER (15)
                  delivered wares; costs _EVAN_RESTOCK_TIME (1 h), +80 km

    Returns (trip_list, still_unserved).
    Each trip dict:
      vehicle_id, type, route, km, hours, stops, wares,
      restock, restock_time, cost_chf
    """
    remaining = list(unserved)
    trips:     List[Dict] = []
    count      = 0

    while remaining and count < _MAX_EVANS:
        count += 1
        route:              List[str] = []
        cum_km              = 0.0
        cum_h               = 0.0
        cum_wares           = 0
        restock_done        = False
        restock_time_h      = 0.0
        effective_max_km    = _EVAN_MAX_KM
        current             = depot

        while remaining:
            best_sid  = None
            best_data = None   # (leg_km, leg_h, would_restock, r_h, new_max_km)

            for sid in remaining:
                coord   = deliveries[sid]["coords"]
                demand  = deliveries[sid]["demand"]

                # capacity guard
                if cum_wares + demand > _EVAN_CAP_WARES:
                    continue

                leg_km, leg_h = engine.distance_and_time(current, coord)
                ret_km, ret_h = engine.distance_and_time(coord, depot)

                # restock opportunity?
                would_restock = (
                    not restock_done
                    and cum_wares >= _EVAN_RESTOCK_AFTER
                )
                extra_km = _EVAN_RESTOCK_BOOST if would_restock else 0.0
                extra_h  = _EVAN_RESTOCK_TIME  if would_restock else 0.0
                cap_km   = effective_max_km + extra_km

                # range guard: can reach stop and return within boosted range
                if cum_km + leg_km > cap_km:
                    continue
                if cum_km + leg_km + ret_km > cap_km:
                    continue

                # shift guard: driving + service + restock + return ≤ 8 h
                new_h_full = (
                    cum_h + leg_h + _EVAN_SERVICE_H + extra_h + ret_h
                )
                if new_h_full > _MAX_SHIFT_H:
                    continue

                if best_sid is None or leg_km < best_data[0]:
                    best_sid  = sid
                    best_data = (leg_km, leg_h, would_restock, extra_h, cap_km)

            if best_sid is None:
                break

            leg_km, leg_h, would_restock, extra_h, new_cap_km = best_data
            demand = deliveries[best_sid]["demand"]

            if would_restock:
                restock_done      = True
                effective_max_km  = new_cap_km
                restock_time_h   += extra_h
                cum_h            += extra_h

            cum_km    += leg_km
            cum_h     += leg_h + _EVAN_SERVICE_H
            cum_wares += demand
            current    = deliveries[best_sid]["coords"]
            route.append(best_sid)
            remaining.remove(best_sid)

        if not route:
            count -= 1
            break

        # return leg
        ret_km, ret_h = engine.distance_and_time(current, depot)
        cum_km += ret_km
        cum_h  += ret_h

        cost = _lastmile_cost("evan", cum_km, cum_h, cost_params)
        trips.append({
            "vehicle_id":   f"EVan_{count}",
            "type":         "evan",
            "route":        route,
            "km":           round(cum_km, 2),
            "hours":        round(cum_h, 2),
            "stops":        len(route),
            "wares":        cum_wares,
            "restock":      restock_done,
            "restock_time": round(restock_time_h, 2),
            "cost_chf":     round(cost, 2),
        })

    return trips, remaining


# =============================================================================
# SECTION 3 — SUB-STEP 2B: LKW GREEDY TRIP BUILDER
# =============================================================================

def _build_lkw_trips(
    unserved:    List[str],
    depot:       Tuple[float, float],
    deliveries:  Dict[str, Any],
    engine:      Any,
    cost_params: Dict[str, Dict[str, float]],
) -> Tuple[List[Dict], List[str]]:
    """
    Greedy nearest-neighbour LKW route builder (overflow from EVan fleet).

    Per-trip constraints:
      range : _LKW_MAX_KM (600 km)
      shift : _MAX_SHIFT_H (8 h) including driving + service
      wares : unlimited per spec

    Returns (trip_list, still_unserved).
    Each trip dict has the same schema as EVan trips
    (restock always False, restock_time always 0.0).
    """
    remaining = list(unserved)
    trips:     List[Dict] = []
    count      = 0

    while remaining and count < _MAX_LKWS:
        count += 1
        route:     List[str] = []
        cum_km     = 0.0
        cum_h      = 0.0
        cum_wares  = 0
        current    = depot

        while remaining:
            best_sid = None
            best_leg = None   # (leg_km, leg_h)

            for sid in remaining:
                coord  = deliveries[sid]["coords"]
                demand = deliveries[sid]["demand"]

                leg_km, leg_h = engine.distance_and_time(current, coord)
                ret_km, ret_h = engine.distance_and_time(coord, depot)

                # range guard
                if cum_km + leg_km + ret_km > _LKW_MAX_KM:
                    continue

                # shift guard
                if cum_h + leg_h + _LKW_SERVICE_H + ret_h > _MAX_SHIFT_H:
                    continue

                if best_sid is None or leg_km < best_leg[0]:
                    best_sid = sid
                    best_leg = (leg_km, leg_h)

            if best_sid is None:
                break

            leg_km, leg_h = best_leg
            demand = deliveries[best_sid]["demand"]

            cum_km    += leg_km
            cum_h     += leg_h + _LKW_SERVICE_H
            cum_wares += demand
            current    = deliveries[best_sid]["coords"]
            route.append(best_sid)
            remaining.remove(best_sid)

        if not route:
            count -= 1
            break

        ret_km, ret_h = engine.distance_and_time(current, depot)
        cum_km += ret_km
        cum_h  += ret_h

        cost = _lastmile_cost("lkw", cum_km, cum_h, cost_params)
        trips.append({
            "vehicle_id":   f"LKW_{count}",
            "type":         "lkw",
            "route":        route,
            "km":           round(cum_km, 2),
            "hours":        round(cum_h, 2),
            "stops":        len(route),
            "wares":        cum_wares,
            "restock":      False,
            "restock_time": 0.0,
            "cost_chf":     round(cost, 2),
        })

    return trips, remaining


# =============================================================================
# SECTION 4 — MAP RENDERING
# =============================================================================

def _build_tooltip(vid: str, stat: Dict[str, Any]) -> str:
    """
    Build the hover-tooltip string shown when mousing over a route polyline.

    Fields:
      Vehicle ID | Type | Stops | Wares transported
      Distance   | Time | Cost (CHF)
      Restock at VZ: yes (X h) | no
    """
    vtype       = stat.get("type", "evan").upper()
    stops       = stat.get("stops", 0)
    wares       = stat.get("wares", 0)
    km          = stat.get("km", 0.0)
    hours       = stat.get("hours", 0.0)
    cost        = stat.get("cost_chf", 0.0)
    restock     = stat.get("restock", False)
    restock_t   = stat.get("restock_time", 0.0)
    restock_str = f"yes ({restock_t:.1f} h consumed)" if restock else "no"

    return (
        f"{vid} | {vtype}\n"
        f"Stops: {stops}  |  Wares: {wares}\n"
        f"Distance: {km:.1f} km  |  Time: {hours:.2f} h\n"
        f"Cost: CHF {cost:.2f}\n"
        f"Restock at VZ: {restock_str}"
    )


def _road_geometry(
    waypoints: List[Tuple[float, float]],
    engine:    Any,
) -> List[Tuple[float, float]]:
    """
    Fetch and stitch OSRM road geometry for an ordered waypoint sequence.
    Falls back to straight-line segments on any engine error.
    Returns a flat list of (lat, lon) tuples.
    """
    coords: List[Tuple[float, float]] = []
    for a, b in zip(waypoints[:-1], waypoints[1:]):
        try:
            seg = engine.geometry(a, b)
        except Exception:
            seg = [a, b]
        coords.extend(seg if not coords else seg[1:])
    return coords or list(waypoints)


def _draw_hub_routes(
    hub_name:    str,
    hub_result:  Dict[str, Any],
    depot:       Tuple[float, float],
    deliveries:  Dict[str, Any],
    engine:      Any,
    map_obj:     Any,
) -> None:
    """
    Draw all vehicle routes for one hub onto *map_obj* (draw_interface).

    Uses add_route_coords so geometry is recorded in map history and
    survives map_object.save() / .load() without an engine reference.
    EVans → green palette, LKWs → red/orange palette.
    """
    routes      = hub_result.get("routes", {})
    stats       = hub_result.get("vehicle_stats", [])
    stat_by_vid = {s["vehicle_id"]: s for s in stats}
    layer       = f"Routes_{hub_name}"
    evan_idx    = 0
    lkw_idx     = 0

    for vid, route in routes.items():
        if not route:
            continue

        stat  = stat_by_vid.get(vid, {})
        vtype = stat.get("type", "evan")

        color  = (
            _EVAN_COLORS[evan_idx % len(_EVAN_COLORS)]
            if vtype == "evan"
            else _LKW_COLORS[lkw_idx % len(_LKW_COLORS)]
        )
        if vtype == "evan":
            evan_idx += 1
        else:
            lkw_idx  += 1

        tooltip = _build_tooltip(vid, stat)

        stop_coords = [
            deliveries[sid]["coords"]
            for sid in route
            if sid in deliveries
        ]
        if not stop_coords:
            continue

        waypoints = [depot] + stop_coords + [depot]
        geom      = _road_geometry(waypoints, engine)

        try:
            map_obj.add_route_coords(
                coords    = geom,
                color     = color,
                weight    = 2.5 if vtype == "evan" else 3.5,
                opacity   = 0.80,
                layer     = layer,
                tooltip   = tooltip,
            )
        except Exception as exc:
            logger.warning(
                f"[MapRender] draw failed for '{vid}' in '{hub_name}': {exc}"
            )


# =============================================================================
# SECTION 5 — SINGLE-HUB VRP WORKER
# =============================================================================

def _build_hub_summary(hub_name: str, hub_result: Dict[str, Any]) -> str:
    """
    Return a formatted per-hub statistics block.

    Example:
      ┌─ VZ_1 ───────────────────────────────────────────────┐
      │  🌿 EVans : 8 vehicles | 241 stops | 1 482.3 km | 48.2 h | CHF  924.50
      │  🚛 LKWs  : 1 vehicle  |  13 stops |   312.1 km |  6.4 h | CHF  201.30
      │  ✅ Unserved : 0
      └──────────────────────────────────────────────────────┘
    """
    stats  = hub_result.get("vehicle_stats", [])
    unserv = len(hub_result.get("unserved", []))
    W      = 58

    def _agg(vtype: str) -> Optional[Dict]:
        sub = [s for s in stats if s["type"] == vtype]
        if not sub:
            return None
        return {
            "n":     len(sub),
            "stops": sum(s["stops"] for s in sub),
            "km":    round(sum(s["km"]    for s in sub), 1),
            "h":     round(sum(s["hours"] for s in sub), 1),
            "cost":  round(sum(s["cost_chf"] for s in sub), 2),
        }

    evan = _agg("evan")
    lkw  = _agg("lkw")
    sep  = "─" * W

    lines = [f"  ┌─ {hub_name} {sep[:max(0, W - len(hub_name) - 3)]}┐"]
    if evan:
        v = "vehicle " if evan["n"] == 1 else "vehicles"
        lines.append(
            f"  │  🌿 EVans : {evan['n']:>2} {v} | "
            f"{evan['stops']:>4} stops | {evan['km']:>8.1f} km | "
            f"{evan['h']:>5.1f} h | CHF {evan['cost']:>9.2f}"
        )
    else:
        lines.append("  │  🌿 EVans : —")

    if lkw:
        v = "vehicle " if lkw["n"] == 1 else "vehicles"
        lines.append(
            f"  │  🚛 LKWs  : {lkw['n']:>2} {v} | "
            f"{lkw['stops']:>4} stops | {lkw['km']:>8.1f} km | "
            f"{lkw['h']:>5.1f} h | CHF {lkw['cost']:>9.2f}"
        )
    else:
        lines.append("  │  🚛 LKWs  : —")

    icon = "✅" if unserv == 0 else "⚠️ "
    lines.append(f"  │  {icon} Unserved : {unserv}")
    lines.append(f"  └{sep}┘")
    return "\n".join(lines)


def _solve_one_hub(
    hub_name:      str,
    group:         pd.DataFrame,
    hub_locations: Dict[str, Tuple[float, float]],
    hub_types:     Dict[str, str],
    engine:        Any,
    lastmile_costs:Dict[str, Dict[str, float]],
    idx:           int,
    total_hubs:    int,
) -> Dict[str, Any]:
    """
    Solve the mixed-fleet VRP for one hub.

    Strategy:
      Stage A — EVan fleet  (green, zero-emission, short-range, restock-aware)
      Stage B — LKW overflow (red, heavy, long-range, for unserved stops)

    Returns hub_result dict:
      hub_name, routes, unserved, vehicle_stats, cost_chf
    """
    depot = hub_locations.get(hub_name)
    if not depot:
        return _empty_hub_result(hub_name)

    deliveries: Dict[str, Dict] = {
        str(pid): {
            "coords": (float(row["lat"]), float(row["lon"])),
            "demand": int(row["demand_wares"]),
        }
        for pid, row in group.iterrows()
        if int(row.get("demand_wares", 0)) > 0
    }
    if not deliveries:
        return _empty_hub_result(hub_name)

    print(
        f"  [Hub {idx:02d}/{total_hubs:02d}] "
        f"🔄 Optimizing '{hub_name}' ({len(deliveries)} pharmacies)…",
        flush=True,
    )
    print()  # required newline after progress line

    # Stage A: EVans
    evan_trips, unserved = _build_evan_trips(
        unserved    = list(deliveries.keys()),
        depot       = depot,
        deliveries  = deliveries,
        engine      = engine,
        cost_params = lastmile_costs,
    )

    # Stage B: LKW overflow
    lkw_trips, unserved = _build_lkw_trips(
        unserved    = unserved,
        depot       = depot,
        deliveries  = deliveries,
        engine      = engine,
        cost_params = lastmile_costs,
    )

    # Merge all trips → vehicle_stats + hub_routes
    all_trips:     List[Dict]            = evan_trips + lkw_trips
    vehicle_stats: List[Dict]            = []
    hub_routes:    Dict[str, List[str]]  = {}

    for trip in all_trips:
        full_vid = f"{hub_name}_{trip['vehicle_id']}"
        hub_routes[full_vid] = trip["route"]
        vehicle_stats.append({
            "vehicle_id":   full_vid,
            "type":         trip["type"],
            "stops":        trip["stops"],
            "km":           trip["km"],
            "hours":        trip["hours"],
            "wares":        trip["wares"],
            "restock":      trip["restock"],
            "restock_time": trip["restock_time"],
            "cost_chf":     trip["cost_chf"],
        })

    n_evan     = len(evan_trips)
    n_lkw      = len(lkw_trips)
    n_unserved = len(unserved)
    cost_total = round(sum(t["cost_chf"] for t in all_trips), 2)

    hub_result = {
        "hub_name":      hub_name,
        "routes":        hub_routes,
        "unserved":      unserved,
        "vehicle_stats": vehicle_stats,
        "cost_chf":      cost_total,
    }

    # Print Done line + per-hub aggregated statistics
    print(
        f"  Done! [{hub_name}] "
        f"(🌿 EVans: {n_evan} | 🚛 LKWs: {n_lkw} | ⚠️ Unserved: {n_unserved})"
    )
    print(_build_hub_summary(hub_name, hub_result))

    return hub_result


def _empty_hub_result(hub_name: str) -> Dict[str, Any]:
    return {
        "hub_name":      hub_name,
        "routes":        {},
        "unserved":      [],
        "vehicle_stats": [],
        "cost_chf":      0.0,
    }


# =============================================================================
# SECTION 6 — PARALLEL VRP ORCHESTRATOR
# =============================================================================

def _plan_last_mile_vrp(
    pharmacy_df:    pd.DataFrame,
    hubs_df:        pd.DataFrame,
    engine:         Any,
    lastmile_costs: Dict[str, Dict[str, float]],
    map_obj:        Optional[Any],
    max_workers:    int,
) -> Dict[str, Any]:
    """
    Parallel mixed-fleet VRP dispatch for all active hubs.

    1. Spawns one thread per hub (_solve_one_hub).
    2. After all threads complete, draws routes single-threadedly on map_obj.
    3. Aggregates per-vehicle telemetry into avg/max summary.

    Returns
    -------
    {
      "hubs"              : {hub_name: hub_result_dict},
      "all_vehicle_stats" : [stat_dict, …],
      "metrics"           : {
          total_distance_km, total_duration_hours,
          unserved_count, total_cost_chf,
          evan: {count, avg_km, max_km, avg_hours, max_hours,
                 avg_stops, max_stops, avg_wares, max_wares},
          lkw:  {same keys},
      },
      "hub_locations"     : {hub_name: (lat, lon)},
      "deliveries_by_hub" : {hub_name: deliveries_dict},
    }
    """
    logger.info("[Step 4.2] Initializing last-mile fleet assignment matrices…")

    if "hub_name" not in hubs_df.columns:
        hubs_df = hubs_df.reset_index().rename(columns={"index": "hub_name"})

    hub_locations: Dict[str, Tuple[float, float]] = {
        row["hub_name"]: (float(row["lat"]), float(row["lon"]))
        for _, row in hubs_df.iterrows()
    }
    hub_types: Dict[str, str] = {
        row["hub_name"]: row["type"]
        for _, row in hubs_df.iterrows()
    }

    grouped       = list(pharmacy_df.groupby("assigned_hub"))
    active_groups = [
        (h, g) for h, g in grouped
        if g["demand_wares"].sum() > 0
    ]
    total_hubs = len(active_groups)

    print(
        f"\n🚀 Starting Last-Mile VRP Routing for {total_hubs} active "
        f"regional hubs (parallel workers: {max_workers})…"
    )

    # Pre-build deliveries_by_hub for post-solve map rendering
    deliveries_by_hub: Dict[str, Dict] = {
        hub_name: {
            str(pid): {
                "coords": (float(row["lat"]), float(row["lon"])),
                "demand": int(row["demand_wares"]),
            }
            for pid, row in group.iterrows()
            if int(row.get("demand_wares", 0)) > 0
        }
        for hub_name, group in active_groups
    }

    # Parallel solve — map_obj intentionally not passed to workers
    # (folium / draw_interface are not thread-safe; drawing happens after)
    futures_args = [
        (
            hub_name, group, hub_locations, hub_types,
            engine, lastmile_costs, idx, total_hubs,
        )
        for idx, (hub_name, group) in enumerate(active_groups, 1)
    ]

    hub_results: List[Dict] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {
            pool.submit(_solve_one_hub, *args): args[0]
            for args in futures_args
        }
        for fut in concurrent.futures.as_completed(futs):
            hub_key = futs[fut]
            try:
                hub_results.append(fut.result())
            except Exception as exc:
                logger.error(f"[VRP] Hub '{hub_key}' failed: {exc}")
                hub_results.append(_empty_hub_result(hub_key))

    print("🏁 Last-Mile routing calculation completed for all active hubs.\n")

    # Post-merge map drawing (single-threaded, safe)
    if map_obj is not None:
        logger.info("[Step 4 MapRender] Drawing all hub routes onto map…")
        for res in hub_results:
            h     = res["hub_name"]
            depot = hub_locations.get(h)
            delivs = deliveries_by_hub.get(h, {})
            if not depot or not res.get("routes"):
                continue
            try:
                _draw_hub_routes(
                    hub_name   = h,
                    hub_result = res,
                    depot      = depot,
                    deliveries = delivs,
                    engine     = engine,
                    map_obj    = map_obj,
                )
            except Exception as exc:
                logger.error(
                    f"[MapRender] draw failed for '{h}': {exc}"
                )
        logger.info(
            "[Step 4 MapRender] ✅ All route geometries committed to map."
        )

    # Aggregate metrics
    all_stats: List[Dict] = []
    for res in hub_results:
        all_stats.extend(res["vehicle_stats"])

    total_km       = sum(s["km"]    for s in all_stats)
    total_hours    = sum(s["hours"] for s in all_stats)
    total_unserved = sum(len(r["unserved"]) for r in hub_results)
    total_cost     = sum(r["cost_chf"]      for r in hub_results)

    def _agg(vtype: str) -> Dict[str, Any]:
        sub = [s for s in all_stats if s["type"] == vtype]
        if not sub:
            return {
                "count": 0, "avg_km": 0.0, "max_km": 0.0,
                "avg_hours": 0.0, "max_hours": 0.0,
                "avg_stops": 0.0, "max_stops": 0,
                "avg_wares": 0.0, "max_wares": 0,
            }
        n = len(sub)
        return {
            "count":      n,
            "avg_km":     round(sum(s["km"]    for s in sub) / n, 1),
            "max_km":     round(max(s["km"]    for s in sub), 1),
            "avg_hours":  round(sum(s["hours"] for s in sub) / n, 2),
            "max_hours":  round(max(s["hours"] for s in sub), 2),
            "avg_stops":  round(sum(s["stops"] for s in sub) / n, 1),
            "max_stops":  max(s["stops"]  for s in sub),
            "avg_wares":  round(sum(s["wares"] for s in sub) / n, 1),
            "max_wares":  max(s["wares"]  for s in sub),
        }

    return {
        "hubs":              {r["hub_name"]: r for r in hub_results},
        "all_vehicle_stats": all_stats,
        "metrics": {
            "total_distance_km":    round(total_km, 2),
            "total_duration_hours": round(total_hours, 2),
            "unserved_count":       total_unserved,
            "total_cost_chf":       round(total_cost, 2),
            "evan":                 _agg("evan"),
            "lkw":                  _agg("lkw"),
        },
        "hub_locations":     hub_locations,
        "deliveries_by_hub": deliveries_by_hub,
    }


# =============================================================================
# SECTION 7 — PRETTY-PRINT SUMMARY
# =============================================================================

def _print_metrics(routing_results: Dict[str, Any]) -> None:
    """Print a formatted logistics matrix summary to stdout."""
    m  = routing_results["last_mile_delivery"]["metrics"]
    hm = routing_results["hub_distribution_network"]
    ev = m["evan"]
    lk = m["lkw"]

    def row(label: str, value: str, unit: str) -> str:
        pad = 36 - len(label)
        return f"║  {label}{' ' * pad}{value:>12} {unit:<6}║"

    print("\n╔══════════════════════════════════════════════════════════════╗")
    print("║              LOGISTICS MATRIX — STEP 4 SUMMARY              ║")
    print("╠══════════════════════════════════════════════════════════════╣")
    print(row("Hub backbone distance (Dijkstra):",
              f"{hm['total_hub_distance_km']:,.2f}", "km"))
    print(row("Hub backbone cost:",
              f"{hm['total_backbone_cost_chf']:,.2f}", "CHF"))
    print("╠══════════════════════════════════════════════════════════════╣")
    print(row("Last-mile total distance (VRP):",
              f"{m['total_distance_km']:,.2f}", "km"))
    print(row("Last-mile total shift time:",
              f"{m['total_duration_hours']:,.2f}", "h"))
    print(row("Last-mile total cost:",
              f"{m['total_cost_chf']:,.2f}", "CHF"))
    print(row("Unserved pharmacies:",
              str(m['unserved_count']), ""))
    print("╠══════════════════════════════════════════════════════════════╣")
    print(f"║  🌿 EVan fleet  ({ev['count']:>4} active vehicles)"
          f"{'':>28}║")
    print(f"║      avg km / max km:       "
          f"{ev['avg_km']:>8.1f}  /  {ev['max_km']:>8.1f} km      ║")
    print(f"║      avg hours / max hours: "
          f"{ev['avg_hours']:>8.2f}  /  {ev['max_hours']:>8.2f} h       ║")
    print(f"║      avg stops / max stops: "
          f"{ev['avg_stops']:>8.1f}  /  {ev['max_stops']:>8}         ║")
    print(f"║      avg wares / max wares: "
          f"{ev['avg_wares']:>8.1f}  /  {ev['max_wares']:>8}         ║")
    print("╠══════════════════════════════════════════════════════════════╣")
    print(f"║  🚛  LKW fleet  ({lk['count']:>4} active vehicles)"
          f"{'':>28}║")
    print(f"║      avg km / max km:       "
          f"{lk['avg_km']:>8.1f}  /  {lk['max_km']:>8.1f} km      ║")
    print(f"║      avg hours / max hours: "
          f"{lk['avg_hours']:>8.2f}  /  {lk['max_hours']:>8.2f} h       ║")
    print(f"║      avg stops / max stops: "
          f"{lk['avg_stops']:>8.1f}  /  {lk['max_stops']:>8}         ║")
    print(f"║      avg wares / max wares: "
          f"{lk['avg_wares']:>8.1f}  /  {lk['max_wares']:>8}         ║")
    print("╚══════════════════════════════════════════════════════════════╝\n")

    print("=================== LOGISTICS MATRIX METRICS ===================")
    print(f"Gesamt-Transportleistung Hub-Netzwerk (Dijkstra): "
          f"{hm['total_hub_distance_km']:>12,.2f} km")
    print(f"Gesamtfahrleistung Last-Mile (VRP):               "
          f"{m['total_distance_km']:>12,.2f} km")
    print(f"Gesamteinsatzzeit aller Transportfahrzeuge:       "
          f"{m['total_duration_hours']:>12,.2f} Stunden")
    print(f"Unversorgte Apotheken (Restriktionsverletzung):   "
          f"{m['unserved_count']}")
    print("=================================================================")


# =============================================================================
# SECTION 8 — PUBLIC ENTRY POINT
# =============================================================================

def plan_routes(
    pharmacy_df:    pd.DataFrame,
    hubs_df:        pd.DataFrame,
    engine:         Any = None,
    map_obj:        Optional[Any] = None,
    max_workers:    int = 16,
    backbone_costs: Optional[Dict[str, float]] = None,
    lastmile_costs: Optional[Dict[str, Dict[str, float]]] = None,
) -> Dict[str, Any]:
    """
    Main orchestration entry point for Step 4.

    Parameters
    ----------
    pharmacy_df    : DataFrame with columns:
                       lat, lon, demand_wares, assigned_hub.
    hubs_df        : DataFrame with columns:
                       hub_name, lat, lon, type.
    engine         : RoutingEngine instance. Auto-resolved from utils if None.
    map_obj        : draw_interface instance for route visualisation.
                     Pass map.drawInterface from the notebook.
    max_workers    : parallel threads for hub VRP solving. Default 16.
    backbone_costs : optional dict to override DEFAULT_BACKBONE_COSTS.
    lastmile_costs : optional dict to override DEFAULT_LASTMILE_COSTS.

    Returns
    -------
    {
      "hub_distribution_network": {
          "ware_paths"              : List[dict],
          "total_hub_distance_km"   : float,
          "total_backbone_cost_chf" : float,
      },
      "last_mile_delivery": {
          "hubs"              : {hub_name: hub_result_dict},
          "all_vehicle_stats" : [stat_dict, …],
          "metrics": {
              "total_distance_km"    : float,
              "total_duration_hours" : float,
              "unserved_count"       : int,
              "total_cost_chf"       : float,
              "evan": {
                  count, avg_km, max_km,
                  avg_hours, max_hours,
                  avg_stops, max_stops,
                  avg_wares, max_wares,
              },
              "lkw": { same keys },
          },
          "hub_locations"     : {hub_name: (lat, lon)},
          "deliveries_by_hub" : {hub_name: deliveries_dict},
      },
    }

    Downstream consumers
    --------------------
    a5_costs.py input keys:
      routing_results["last_mile_delivery"]["metrics"]["total_cost_chf"]
      routing_results["hub_distribution_network"]["total_backbone_cost_chf"]
    """
    # Resolve engine from utils singleton if not provided
    if engine is None:
        from utils import utils
        engine = utils.engine

    # Merge cost overrides with defaults
    bc = {**DEFAULT_BACKBONE_COSTS,  **(backbone_costs or {})}
    lc = {**DEFAULT_LASTMILE_COSTS,  **(lastmile_costs or {})}

    logger.info("=" * 65)
    logger.info("[Step 4] Starting Full Logistics Network Optimization Run")
    logger.info("=" * 65)

    # ── Sub-Step 1: Dijkstra backbone supply network ──────────────────────────
    hub_network = _optimize_hub_distribution(
        pharmacy_df    = pharmacy_df,
        hubs_df        = hubs_df,
        engine         = engine,
        backbone_costs = bc,
    )

    # ── Sub-Step 2: Mixed-fleet last-mile VRP ─────────────────────────────────
    last_mile = _plan_last_mile_vrp(
        pharmacy_df    = pharmacy_df,
        hubs_df        = hubs_df,
        engine         = engine,
        lastmile_costs = lc,
        map_obj        = map_obj,
        max_workers    = max_workers,
    )

    logger.info(
        "### [Step 4] Pipeline complete. Fleet routing telemetry verified."
    )

    result = {
        "hub_distribution_network": hub_network,
        "last_mile_delivery":       last_mile,
    }

    _print_metrics(result)
    return result
