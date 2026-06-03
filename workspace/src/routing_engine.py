"""
routing_engine.py – OSRM + OR-Tools optimization engine for Swiss logistics pipeline.

Two responsibilities:
  1. Routing primitives  – distance/time via OSRM, geometry, distance matrices
  2. Route optimization  – VRP, TSP, assignment via Google OR-Tools

osmnx / networkx are used for spatial graph queries (nearest node, 
subgraph analysis, cluster detection) not for routing itself.
"""

import json
import urllib.request
import logging
import numpy as np
import pandas as pd
import osmnx as ox
import networkx as nx
from geopy.distance import geodesic
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from ortools.sat.python import cp_model

logger = logging.getLogger(__name__)

OSRM_TIMEOUT = 15

VEHICLE_PROFILES = {
    "van":         {"speed_factor": 1.00, "cost_per_km": 0.20, "capacity": 80},
    "lkw":         {"speed_factor": 0.95, "cost_per_km": 0.30, "capacity": 120},
    "evan":        {"speed_factor": 1.00, "cost_per_km": 0.20, "capacity": 60},
}


# ---------------------------------------------------------------------------
# OSRM HTTP primitives  (pure functions)
# ---------------------------------------------------------------------------

def _coords_str(points: list) -> str:
    return ";".join(f"{lon},{lat}" for lat, lon in points)


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=OSRM_TIMEOUT) as r:
        data = json.loads(r.read())
    if data.get("code") != "Ok":
        raise ValueError(f"OSRM error: {data.get('code')} – {data.get('message', '')}")
    return data


def osrm_route(base_url: str, origin: tuple, destination: tuple,
               geometry: bool = False) -> dict:
    overview = "full" if geometry else "false"
    url = (f"{base_url}/route/v1/driving/"
           f"{_coords_str([origin, destination])}"
           f"?overview={overview}&geometries=geojson")
    return _get(url)


def osrm_table(base_url: str, sources: list, destinations: list) -> dict:
    """
    OSRM /table — duration + distance matrix in one HTTP call.
    sources / destinations are lists of (lat, lon).
    """
    all_coords  = sources + destinations
    src_indices = ";".join(str(i) for i in range(len(sources)))
    dst_indices = ";".join(str(i) for i in range(len(sources), len(all_coords)))
    url = (f"{base_url}/table/v1/driving/{_coords_str(all_coords)}"
           f"?sources={src_indices}&destinations={dst_indices}"
           f"&annotations=duration,distance")
    return _get(url)


# ---------------------------------------------------------------------------
# RoutingEngine
# ---------------------------------------------------------------------------

class RoutingEngine:
    """
    OSRM-backed routing + OR-Tools optimization engine.

    Routing:
        engine.distance_and_time(origin, destination)
        engine.geometry(origin, destination)
        engine.distance_matrix(locations_dict)
        engine.table(sources, destinations)         ← batch via OSRM /table

    Optimization  (all return structured result dicts):
        engine.solve_tsp(locations, depot)
        engine.solve_vrp(depot, deliveries, vehicles)
        engine.solve_assignment(pharmacies, hubs)   ← used by a2

    Spatial helpers (osmnx / networkx):
        engine.nearest_hub(point, hub_locations)
        engine.build_spatial_graph(locations)
        engine.connected_components(locations, threshold_km)
    """

    def __init__(self, osrm_url: str = "http://localhost:5001",
                 use_cache: bool = True,
                 road_factor: float = 1.25):
        self.osrm_url    = osrm_url.rstrip("/")
        self.use_cache   = use_cache
        self.road_factor = road_factor
        self._cache: dict = {}
        self._alive: bool | None = None

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    def ping(self) -> bool:
        if self._alive is not None:
            return self._alive
        try:
            osrm_route(self.osrm_url, (47.3769, 8.5472), (46.9479, 7.4474))
            self._alive = True
            logger.info(f"✅ OSRM reachable at {self.osrm_url}")
        except Exception as exc:
            self._alive = False
            logger.warning(f"⚠️  OSRM unreachable: {exc} — fallback active")
        return self._alive

    # ------------------------------------------------------------------
    # Routing primitives
    # ------------------------------------------------------------------

    def distance_and_time(self, origin: tuple, destination: tuple,
                          vehicle: str = "van") -> tuple:
        """Return (distance_km, travel_hours)."""
        key = (origin, destination, vehicle)
        if self.use_cache and key in self._cache:
            return self._cache[key]

        profile = VEHICLE_PROFILES.get(vehicle, VEHICLE_PROFILES["van"])

        if self.ping():
            try:
                data    = osrm_route(self.osrm_url, origin, destination)
                leg     = data["routes"][0]["legs"][0]
                dist_km = leg["distance"] / 1000
                time_h  = (leg["duration"] / 3600) / profile["speed_factor"]
                result  = (dist_km, time_h)
                if self.use_cache:
                    self._cache[key] = result
                return result
            except Exception as exc:
                logger.debug(f"OSRM route error: {exc} — fallback")

        result = self._fallback(origin, destination, profile)
        if self.use_cache:
            self._cache[key] = result
        return result

    def geometry(self, origin: tuple, destination: tuple) -> list:
        """Return [(lat,lon), …] road geometry. Falls back to straight line."""
        if not self.ping():
            return [origin, destination]
        try:
            data   = osrm_route(self.osrm_url, origin, destination, geometry=True)
            coords = data["routes"][0]["geometry"]["coordinates"]
            return [(lat, lon) for lon, lat in coords]
        except Exception as exc:
            logger.warning(f"⚠️ OSRM geometry error: {exc} — returning straight line.")
            return [origin, destination]

    def table(self, sources: list, destinations: list,
              vehicle: str = "van") -> tuple:
        """
        Batch duration + distance matrix via OSRM /table.

        Returns
        -------
        (dist_matrix_km, time_matrix_h)  both as np.ndarray shape (n_src, n_dst)
        """
        profile = VEHICLE_PROFILES.get(vehicle, VEHICLE_PROFILES["van"])

        if self.ping():
            try:
                data     = osrm_table(self.osrm_url, sources, destinations)
                dur_mat  = np.array(data["durations"]) / 3600 / profile["speed_factor"]
                dist_mat = np.array(data["distances"]) / 1000
                return dist_mat, dur_mat
            except Exception as exc:
                logger.debug(f"OSRM table error: {exc} — fallback")

        # Fallback: pairwise geodesic
        n_s = len(sources)
        n_d = len(destinations)
        dist_mat = np.zeros((n_s, n_d))
        time_mat = np.zeros((n_s, n_d))
        for i, s in enumerate(sources):
            for j, d in enumerate(destinations):
                dist_mat[i, j], time_mat[i, j] = self._fallback(s, d, profile)
        return dist_mat, time_mat

    def distance_matrix(self, locations: dict, vehicle: str = "van") -> tuple:
        """
        Full n×n matrices for a {name: (lat,lon)} dict.

        Returns
        -------
        (df_dist_km, df_time_h)  both as pandas DataFrames
        """
        names  = list(locations.keys())
        coords = list(locations.values())
        dist_mat, time_mat = self.table(coords, coords, vehicle)
        np.fill_diagonal(dist_mat, 0)
        np.fill_diagonal(time_mat, 0)
        return (
            pd.DataFrame(dist_mat, index=names, columns=names),
            pd.DataFrame(time_mat, index=names, columns=names),
        )

    # ------------------------------------------------------------------
    # Spatial helpers  (osmnx / networkx)
    # ------------------------------------------------------------------

    def nearest_hub(self, point: tuple, hub_locations: dict,
                    weight: str = "time") -> str:
        """
        Return the name of the nearest hub to point (lat, lon).

        weight : 'time'     → minimise travel time  (default)
                 'distance' → minimise road distance
        """
        best_hub  = None
        best_val  = np.inf
        col_idx   = 1 if weight == "time" else 0

        hub_names  = list(hub_locations.keys())
        hub_coords = list(hub_locations.values())

        dist_mat, time_mat = self.table([point], hub_coords)
        values = (time_mat if weight == "time" else dist_mat)[0]

        best_idx = int(np.argmin(values))
        return hub_names[best_idx]

    def build_spatial_graph(self, locations: dict,
                            threshold_km: float = 50.0) -> nx.Graph:
        """
        Build a NetworkX graph where nodes are location names and edges
        connect pairs within threshold_km road distance.

        Useful for cluster detection, connectivity checks, or custom
        graph algorithms before running OR-Tools optimization.
        """
        names  = list(locations.keys())
        coords = list(locations.values())
        dist_mat, _ = self.table(coords, coords)

        G = nx.Graph()
        for name in names:
            G.add_node(name, coords=locations[name])

        n = len(names)
        for i in range(n):
            for j in range(i + 1, n):
                if dist_mat[i, j] <= threshold_km:
                    G.add_edge(names[i], names[j],
                               distance_km=round(dist_mat[i, j], 2))
        return G

    def connected_components(self, locations: dict,
                              threshold_km: float = 50.0) -> list:
        """
        Return list of connected component sets for the spatial graph.
        Helpful for detecting isolated pharmacies or unreachable hubs.
        """
        G = self.build_spatial_graph(locations, threshold_km)
        return list(nx.connected_components(G))

    def nearest_osm_nodes(self, locations: dict) -> dict:
        """
        Snap each (lat,lon) to its nearest OSM node ID using osmnx.
        Requires a loaded osmnx graph (optional, used for custom graph ops).

        Returns {name: osm_node_id}
        """
        if not hasattr(self, "_ox_graph") or self._ox_graph is None:
            logger.warning("No osmnx graph loaded — call load_ox_graph() first.")
            return {}
        result = {}
        for name, (lat, lon) in locations.items():
            try:
                result[name] = ox.nearest_nodes(self._ox_graph, lon, lat)
            except Exception:
                result[name] = None
        return result

    def load_ox_graph(self, place: str = "Switzerland") -> bool:
        """
        Optionally load an osmnx graph for spatial graph queries.
        Not needed for routing (OSRM handles that).
        """
        try:
            self._ox_graph = ox.graph_from_place(place, network_type="drive")
            logger.info(f"✅ osmnx graph loaded for '{place}'")
            return True
        except Exception as exc:
            logger.warning(f"osmnx load failed: {exc}")
            self._ox_graph = None
            return False

    # ------------------------------------------------------------------
    # OR-Tools: Assignment (a2 – pharmacy → hub)
    # ------------------------------------------------------------------

    def solve_assignment(self, pharmacies: dict, hubs: dict,
                         hub_weights: dict | None = None,
                         vehicle: str = "van") -> dict:
        """
        Assign each pharmacy to exactly one hub minimising total weighted
        travel time using OR-Tools CP-SAT.

        Parameters
        ----------
        pharmacies  : {pid: (lat, lon)}
        hubs        : {hub_name: (lat, lon)}
        hub_weights : {hub_name: float} penalty multiplier per hub type
                      e.g. {"HQ": 1.5, "VZ_Basel": 1.2, "mVZ_1": 1.0}
                      defaults to 1.0 for all
        vehicle     : vehicle profile

        Returns
        -------
        {pid: hub_name}
        """
        hub_weights = hub_weights or {}
        p_ids    = list(pharmacies.keys())
        p_coords = list(pharmacies.values())
        h_names  = list(hubs.keys())
        h_coords = list(hubs.values())

        logger.info(f"[Assignment] {len(p_ids)} pharmacies × {len(h_names)} hubs …")

        # Batch time matrix: pharmacies × hubs
        _, time_mat = self.table(p_coords, h_coords, vehicle)

        # Apply hub penalty weights
        for j, h_name in enumerate(h_names):
            w = hub_weights.get(h_name, 1.0)
            time_mat[:, j] *= w

        # Scale to integers for CP-SAT (0.001 h precision)
        scale    = 1000
        cost_int = (time_mat * scale).astype(int)

        model = cp_model.CpModel()
        n_p, n_h = len(p_ids), len(h_names)

        # x[i][j] = 1 if pharmacy i assigned to hub j
        x = [[model.NewBoolVar(f"x_{i}_{j}") for j in range(n_h)]
             for i in range(n_p)]

        # Each pharmacy assigned to exactly one hub
        for i in range(n_p):
            model.AddExactlyOne(x[i])

        # Minimise total weighted travel time
        model.Minimize(
            sum(cost_int[i][j] * x[i][j]
                for i in range(n_p)
                for j in range(n_h))
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 60.0
        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning("[Assignment] CP-SAT found no solution — nearest hub fallback")
            return {pid: self.nearest_hub(coord, hubs, weight="time")
                    for pid, coord in pharmacies.items()}

        result = {}
        for i, pid in enumerate(p_ids):
            for j, h_name in enumerate(h_names):
                if solver.Value(x[i][j]):
                    result[pid] = h_name
                    break

        logger.info(f"[Assignment] ✅ done, objective = "
                    f"{solver.ObjectiveValue() / scale:.1f} weighted hub-hours")
        return result

    # ------------------------------------------------------------------
    # OR-Tools: TSP  (single vehicle, ordered tour)
    # ------------------------------------------------------------------

    def solve_tsp(self, locations: dict, depot: str,
                  vehicle: str = "van",
                  optimize_for: str = "time") -> dict:
        """
        Solve Travelling Salesman Problem for a single vehicle.

        Parameters
        ----------
        locations    : {name: (lat,lon)} — includes depot
        depot        : key in locations that is the start/end point
        optimize_for : 'time' | 'distance'

        Returns
        -------
        {
          'route':       [name, …],   ordered stop list starting and ending at depot
          'total_km':    float,
          'total_hours': float,
        }
        """
        names  = list(locations.keys())
        coords = list(locations.values())
        depot_idx = names.index(depot)

        dist_mat, time_mat = self.table(coords, coords, vehicle)
        cost_mat = time_mat if optimize_for == "time" else dist_mat

        # Scale to int
        scale    = 1000
        cost_int = (cost_mat * scale).astype(int).tolist()

        manager = pywrapcp.RoutingIndexManager(len(names), 1, depot_idx)
        routing = pywrapcp.RoutingModel(manager)

        def cost_cb(from_idx, to_idx):
            return cost_int[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]

        cb_idx = routing.RegisterTransitCallback(cost_cb)
        routing.SetArcCostEvaluatorOfAllVehicles(cb_idx)

        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
        params.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
        params.time_limit.seconds = 30

        solution = routing.SolveWithParameters(params)

        if not solution:
            logger.warning("[TSP] No solution found")
            return {"route": [], "total_km": 0, "total_hours": 0}

        route = []
        idx   = routing.Start(0)
        while not routing.IsEnd(idx):
            route.append(names[manager.IndexToNode(idx)])
            idx = solution.Value(routing.NextVar(idx))
        route.append(depot)  # close tour

        total_km = sum(dist_mat[names.index(route[i])][names.index(route[i+1])]
                       for i in range(len(route) - 1))
        total_h  = sum(time_mat[names.index(route[i])][names.index(route[i+1])]
                       for i in range(len(route) - 1))

        return {"route": route, "total_km": round(total_km, 2),
                "total_hours": round(total_h, 2)}

    # ------------------------------------------------------------------
    # OR-Tools: VRP  (multi-vehicle, capacitated, time-windowed)
    # ------------------------------------------------------------------

    def solve_vrp(self, depot: tuple, deliveries: dict,
                  vehicles: list,
                  optimize_for: str = "time",
                  max_hours: float = 4.0,
                  service_time_h: float = 0.5) -> dict:
        """
        Capacitated Vehicle Routing Problem with time constraints.

        Parameters
        ----------
        depot        : (lat, lon) of the depot
        deliveries   : {name: {"coords": (lat,lon), "demand": int}}
        vehicles     : [{"id": str, "type": "lkw"|"evan"|"van",
                          "capacity": int, "max_km": float}, …]
        optimize_for : 'time' | 'distance'
        max_hours    : max one-way travel time per vehicle (depot→last→depot)
        service_time_h: time spent at each delivery stop (hours)

        Returns
        -------
        {
          "routes": {vehicle_id: [stop_name, …]},
          "unserved": [stop_name, …],
          "total_km": float,
          "total_hours": float,
        }
        """
        stop_names  = list(deliveries.keys())
        stop_coords = [deliveries[n]["coords"] for n in stop_names]
        demands     = [deliveries[n]["demand"]  for n in stop_names]
        n_stops     = len(stop_names)
        n_vehicles  = len(vehicles)

        # Location list: depot at index 0, then stops
        all_coords = [depot] + stop_coords
        all_names  = ["depot"] + stop_names

        dist_mat, time_mat = self.table(all_coords, all_coords,
                                        vehicle=vehicles[0]["type"])
        cost_mat = time_mat if optimize_for == "time" else dist_mat

        # Add service time to each non-depot node
        svc_int  = int(service_time_h * 1000)
        scale    = 1000
        cost_int = (cost_mat * scale).astype(int).tolist()
        time_int = (time_mat * scale).astype(int).tolist()

        capacities = [v["capacity"] for v in vehicles]
        max_km_int = [int(v.get("max_km", 600) * scale) for v in vehicles]
        max_t_int  = [int(max_hours * 2 * scale)] * n_vehicles  # round-trip budget

        manager = pywrapcp.RoutingIndexManager(
            len(all_names), n_vehicles, 0)   # depot = 0
        routing = pywrapcp.RoutingModel(manager)

        # Arc cost
        def make_cost_cb(mat):
            def cb(from_idx, to_idx):
                return mat[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]
            return cb

        cost_cb_idx = routing.RegisterTransitCallback(make_cost_cb(cost_int))
        routing.SetArcCostEvaluatorOfAllVehicles(cost_cb_idx)

        # Time dimension (includes service time at stops)
        def time_cb(from_idx, to_idx):
            from_node = manager.IndexToNode(from_idx)
            to_node   = manager.IndexToNode(to_idx)
            svc = svc_int if from_node != 0 else 0
            return time_int[from_node][to_node] + svc

        time_cb_idx = routing.RegisterTransitCallback(time_cb)
        routing.AddDimensionWithVehicleCapacity(
            time_cb_idx,
            0,           # no slack
            max_t_int,
            True,        # start cumul at zero
            "Time"
        )

        # Distance dimension
        dist_int = (dist_mat * scale).astype(int).tolist()
        dist_cb_idx = routing.RegisterTransitCallback(make_cost_cb(dist_int))
        routing.AddDimensionWithVehicleCapacity(
            dist_cb_idx,
            0,
            max_km_int,
            True,
            "Distance"
        )

        # Demand / capacity dimension
        def demand_cb(from_idx):
            node = manager.IndexToNode(from_idx)
            return demands[node - 1] if node > 0 else 0

        demand_cb_idx = routing.RegisterUnaryTransitCallback(demand_cb)
        routing.AddDimensionWithVehicleCapacity(
            demand_cb_idx,
            0,
            capacities,
            True,
            "Capacity"
        )

        # Allow dropping nodes (penalty = very high but finite)
        penalty = int(1e7)
        for node in range(1, len(all_names)):
            routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
        params.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
        params.time_limit.seconds = 60

        solution = routing.SolveWithParameters(params)

        if not solution:
            logger.warning("[VRP] No solution found")
            return {"routes": {}, "unserved": stop_names,
                    "total_km": 0, "total_hours": 0}

        routes   = {}
        served   = set()
        total_km = 0.0
        total_h  = 0.0

        for v_idx, v in enumerate(vehicles):
            vid   = v["id"]
            idx   = routing.Start(v_idx)
            route = []
            while not routing.IsEnd(idx):
                node = manager.IndexToNode(idx)
                if node != 0:
                    route.append(all_names[node])
                    served.add(all_names[node])
                idx = solution.Value(routing.NextVar(idx))
            if route:
                routes[vid] = route
                # Accumulate costs
                full_route = ["depot"] + route + ["depot"]
                for i in range(len(full_route) - 1):
                    a = all_names.index(full_route[i])
                    b = all_names.index(full_route[i + 1])
                    total_km += dist_mat[a][b]
                    total_h  += time_mat[a][b]
                total_h += len(route) * service_time_h

        unserved = [n for n in stop_names if n not in served]
        if unserved:
            logger.warning(f"[VRP] {len(unserved)} stops unserved: {unserved[:5]}…")

        return {
            "routes":       routes,
            "unserved":     unserved,
            "total_km":     round(total_km, 2),
            "total_hours":  round(total_h, 2),
        }

    # ------------------------------------------------------------------
    # Fallback
    # ------------------------------------------------------------------

    def _fallback(self, origin: tuple, destination: tuple,
                  profile: dict) -> tuple:
        logger.warning(f"⚠️ OSRM Fallback triggered for {origin} -> {destination}. Using geodesic math.")
        air_km   = geodesic(origin, destination).km
        road_km  = air_km * self.road_factor
        avg_spd  = 55 * profile["speed_factor"]
        return (road_km, road_km / avg_spd)
