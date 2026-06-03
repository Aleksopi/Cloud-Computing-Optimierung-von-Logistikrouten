"""
Routing Engine for real road networks.
Uses OpenStreetMap data via OSMNX / NetworkX.

Loading strategies
------------------
load_region(place_query)          – any OSM-resolvable place string
load_bbox(N, S, E, W, name)       – single bounding box
load_tiled(N, S, E, W, name,      – splits a large bbox into a rows×cols grid,
           rows, cols,              downloads each tile, merges into one graph,
           progress_cb)             and calls progress_cb(pct, msg) every tile
load_from_points(locations_dict)  – auto-computes bbox + padding from your
                                    own location dict, then calls load_tiled
"""

import osmnx as ox
import networkx as nx
from geopy.distance import geodesic
import pandas as pd
import numpy as np
import logging
import pickle
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RoutingEngine:
    """
    Engine for realistic road-routing calculations.
    Loads road networks from OpenStreetMap (OSMNX) and routes via NetworkX.

    Usage
    -----
    # By named place (any OSM-recognised string):
    engine = RoutingEngine(cache_dir='/tmp/cache')
    engine.load_region('Zurich, Switzerland')
    engine.load_region('Canton of Bern, Switzerland')
    engine.load_region('Bavaria, Germany')

    # By bounding box (north, south, east, west):
    engine.load_bbox(47.81, 45.82, 10.49, 5.96, name='my_region')

    dist_km, time_h = engine.calculate_distance_and_time((47.37, 8.54), (46.94, 7.44))
    """

    SPEED_PROFILE = {
        'motorway':      120,
        'trunk':         100,
        'primary':        80,
        'secondary':      70,
        'tertiary':       60,
        'unclassified':   50,
        'residential':    40,
        'living_street':  20,
        'service':        20,
        'default':        50,
    }

    VEHICLE_PROFILES = {
        'van':         {'capacity': 80,  'speed_factor': 1.00, 'cost_per_km': 0.45},
        'truck_small': {'capacity': 120, 'speed_factor': 0.95, 'cost_per_km': 0.55},
        'truck_large': {'capacity': 200, 'speed_factor': 0.90, 'cost_per_km': 0.65},
    }

    def __init__(self, use_cache: bool = True, cache_dir: str = '/workspace/cache',
                 road_factor: float = 1.20):
        """
        Parameters
        ----------
        use_cache   : persist graphs and route results to disk / memory
        cache_dir   : directory for .pkl graph files
        road_factor : multiplier applied to straight-line distances in the
                      fallback mode (no graph loaded).  1.20 is a reasonable
                      default for mixed terrain; increase for mountainous areas.
        """
        self.use_cache = use_cache
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.road_factor = road_factor

        self.graph = None
        self.loaded_regions: set = set()
        self.route_cache: dict = {}
        self._node_cache: dict = {}          # replaces @lru_cache on method

        logger.info(f"RoutingEngine ready – cache: {self.cache_dir}")

    # ------------------------------------------------------------------
    # Graph loading
    # ------------------------------------------------------------------

    def load_region(self, place_query: str) -> bool:
        """
        Load a road network by OSM place name.

        Parameters
        ----------
        place_query : any string OSM can resolve, e.g.
                      'Zurich, Switzerland'
                      'Canton of Bern, Switzerland'
                      'Munich, Germany'
                      'Paris, France'

        Returns
        -------
        True on success, False on failure (fallback mode active).
        """
        safe_key = place_query.replace(' ', '_').replace(',', '')
        return self._load(safe_key, lambda: ox.graph_from_place(
            place_query, network_type='drive', simplify=True, retain_all=False
        ))

    def load_bbox(self, north: float, south: float,
                  east: float, west: float, name: str = 'bbox') -> bool:
        """
        Load a road network by bounding box.

        Parameters
        ----------
        north/south/east/west : WGS84 decimal degrees
        name                  : label used for the cache file

        Returns
        -------
        True on success, False on failure.
        """
        safe_key = name.replace(' ', '_')
        return self._load(safe_key,
                          lambda: self._ox_graph_from_bbox(north, south, east, west))

    def load_tiled(self, north: float, south: float, east: float, west: float,
                   name: str = 'region', rows: int = 4, cols: int = 5,
                   progress_cb=None) -> bool:
        """
        Download a large area by splitting it into a rows×cols grid of tiles,
        fetching each tile individually, then merging everything into one graph.

        With rows=4, cols=5 you get 20 tiles → each tile = 5 % progress,
        which is exactly what the Jupyter progress cell reports.

        Parameters
        ----------
        north/south/east/west : bounding box in WGS84 decimal degrees
        name                  : label for the merged cache file
        rows, cols            : grid dimensions (rows×cols tiles total)
        progress_cb           : optional callable(pct: int, message: str)
                                called after every tile; pct runs 0→100

        Returns
        -------
        True if at least one tile was downloaded successfully.
        """
        safe_key = f"{name.replace(' ', '_')}_{rows}x{cols}"
        merged_cache = self.cache_dir / f"graph_{safe_key}.pkl"

        # Serve from merged cache if available
        if self.use_cache and merged_cache.exists():
            logger.info(f"Loading merged graph from disk: {merged_cache}")
            g = self._load_graph(merged_cache)
            if g is not None:
                self.graph = g
                self._add_speeds()
                self._node_cache.clear()
                self.loaded_regions.add(safe_key)
                if progress_cb:
                    progress_cb(100, f"Loaded from cache – {len(g.nodes):,} nodes")
                logger.info(f"✅ {len(g.nodes):,} nodes, {len(g.edges):,} edges")
                return True

        lat_step = (north - south) / rows
        lon_step = (east  - west)  / cols
        total    = rows * cols
        tile_num = 0
        tile_graphs = []
        failed   = 0

        for r in range(rows):
            for c in range(cols):
                tile_num += 1
                t_north = north - r * lat_step
                t_south = t_north - lat_step
                t_west  = west  + c * lon_step
                t_east  = t_west + lon_step

                pct = round((tile_num - 1) / total * 100)
                msg = (f"Tile {tile_num}/{total}  "
                       f"[{t_south:.3f}°N–{t_north:.3f}°N, "
                       f"{t_west:.3f}°E–{t_east:.3f}°E]")

                if progress_cb:
                    progress_cb(pct, msg)
                logger.info(msg)

                tile_key  = f"{safe_key}_r{r}c{c}"
                tile_file = self.cache_dir / f"graph_{tile_key}.pkl"

                # Use per-tile disk cache so a restart only re-fetches missing tiles
                if self.use_cache and tile_file.exists():
                    g_tile = self._load_graph(tile_file)
                    if g_tile is not None:
                        tile_graphs.append(g_tile)
                        continue

                try:
                    g_tile = self._ox_graph_from_bbox(t_north, t_south, t_east, t_west)
                    if self.use_cache:
                        self._save_graph_to(g_tile, tile_file)
                    tile_graphs.append(g_tile)
                except Exception as exc:
                    exc_str = str(exc)
                    # Empty tiles (glacier, lake, uninhabited alpine) are normal –
                    # osmnx raises InsufficientResponseError / ValueError when there
                    # are zero nodes.  Don't count those as hard failures.
                    innocuous = any(k in exc_str.lower() for k in (
                        'insufficient', 'no data', 'empty', 'found no graph',
                        'no nodes', 'response error',
                    ))
                    if innocuous:
                        logger.info(f"  Tile {tile_num}: empty area (no roads) – skipped")
                    else:
                        logger.warning(f"  Tile {tile_num} FAILED ({type(exc).__name__}): {exc_str[:160]}")
                        if progress_cb:
                            progress_cb(pct,
                                        f"⚠️  Tile {tile_num} failed "
                                        f"({type(exc).__name__}): {exc_str[:80]}")
                        failed += 1

        if not tile_graphs:
            logger.warning("All tiles failed – falling back to straight-line distances")
            if progress_cb:
                progress_cb(100, "❌ All tiles failed – fallback mode active")
            return False

        # Merge all tile graphs into one
        if progress_cb:
            progress_cb(98, f"Merging {len(tile_graphs)} tile graphs…")
        logger.info(f"Merging {len(tile_graphs)} tiles ({failed} failed)…")

        merged = tile_graphs[0]
        for g_tile in tile_graphs[1:]:
            merged = nx.compose(merged, g_tile)

        self.graph = merged
        self._add_speeds()
        self._node_cache.clear()
        self.loaded_regions.add(safe_key)

        if self.use_cache:
            self._save_graph(merged_cache)

        if progress_cb:
            progress_cb(100,
                        f"✅ Done – {len(merged.nodes):,} nodes, "
                        f"{len(merged.edges):,} edges  "
                        f"({failed}/{total} tiles failed)")
        logger.info(f"✅ Merged graph: {len(merged.nodes):,} nodes, "
                    f"{len(merged.edges):,} edges")
        return True

    def load_from_points(self, locations_dict: dict, name: str = 'region',
                         padding_deg: float = 0.05,
                         rows: int = 4, cols: int = 5,
                         progress_cb=None) -> bool:
        """
        Compute a bounding box from your locations dict (+ padding),
        then call load_tiled().  Simplest entry-point for a new scenario.

        Parameters
        ----------
        locations_dict : {name: (lat, lon)} – same dict you pass to the optimizer
        name           : label for cache files
        padding_deg    : extra degrees added on every side of the bbox
        rows, cols     : tile grid (rows×cols = number of tiles; each = 100/total %)
        progress_cb    : optional callable(pct, message)
        """
        lats = [v[0] for v in locations_dict.values()]
        lons = [v[1] for v in locations_dict.values()]
        return self.load_tiled(
            north=max(lats) + padding_deg,
            south=min(lats) - padding_deg,
            east =max(lons) + padding_deg,
            west =min(lons) - padding_deg,
            name=name,
            rows=rows,
            cols=cols,
            progress_cb=progress_cb,
        )

    def load_pbf(self, pbf_path: str, name: str = 'pbf') -> bool:
        """
        Load a road network from a local OSM PBF file.

        Requires ``pyrosm`` (``pip install pyrosm``).
        After the first load the graph is pickled to *cache_dir* so that
        subsequent runs take < 5 s regardless of PBF size.

        Parameters
        ----------
        pbf_path : path to an ``*.osm.pbf`` file
        name     : label used for the pickle cache file
                   (defaults to the PBF stem when not supplied)

        Returns
        -------
        True on success, False on failure (fallback mode stays active).
        """
        pbf_path = Path(pbf_path)
        if not pbf_path.exists():
            logger.error(f"PBF file not found: {pbf_path}")
            return False

        # Use the file stem as the cache key when no explicit name was given
        safe_key   = (pbf_path.stem if name == 'pbf' else name).replace(' ', '_')
        cache_file = self.cache_dir / f"graph_{safe_key}.pkl"

        # ── 1. Serve from pkl cache if available ─────────────────────────
        if self.use_cache and cache_file.exists():
            logger.info(f"Loading graph from cache: {cache_file}")
            g = self._load_graph(cache_file)
            if g is not None:
                self.graph = g
                self._add_speeds()
                self._node_cache.clear()
                self.loaded_regions.add(safe_key)
                logger.info(f"✅ Loaded from cache – {len(g.nodes):,} nodes, "
                            f"{len(g.edges):,} edges")
                return True

        # ── 2. Parse PBF with pyrosm ──────────────────────────────────────
        try:
            from pyrosm import OSM as PyrosmOSM          # lazy import
        except ImportError:
            logger.error("pyrosm is not installed – run: pip install pyrosm")
            return False

        logger.info(f"Parsing PBF: {pbf_path}  (this may take a few minutes…)")
        try:
            osm    = PyrosmOSM(str(pbf_path))
            nodes, edges = osm.get_network(network_type='driving', nodes=True)

            if nodes is None or edges is None or nodes.empty or edges.empty:
                logger.warning("PBF contained no drivable road network – fallback active")
                return False

            # Build an osmnx-compatible MultiDiGraph via graph_from_gdfs
            # pyrosm node GeoDataFrame uses 'id' as the index; osmnx expects
            # the index to be named 'osmid'.
            if nodes.index.name != 'osmid':
                nodes = nodes.copy()
                if 'id' in nodes.columns:
                    nodes = nodes.set_index('id')
                nodes.index.name = 'osmid'

            # Ensure coordinate columns 'x' (lon) and 'y' (lat) are present
            if 'x' not in nodes.columns and nodes.geometry is not None:
                nodes['x'] = nodes.geometry.x
                nodes['y'] = nodes.geometry.y

            g = ox.graph_from_gdfs(nodes, edges)

        except Exception as exc:
            logger.warning(f"⚠️  PBF load failed ({type(exc).__name__}): {str(exc)[:200]}")
            logger.info("Falling back to straight-line + road_factor distances.")
            return False

        self.graph = g
        self._add_speeds()
        self._node_cache.clear()
        self.loaded_regions.add(safe_key)
        logger.info(f"✅ PBF loaded – {len(g.nodes):,} nodes, {len(g.edges):,} edges")

        if self.use_cache:
            self._save_graph(cache_file)

        return True

    def load_osrm(self, base_url: str = 'http://router.project-osrm.org') -> bool:
        """
        Switch the engine to OSRM HTTP routing – no graph loaded in memory.

        All calls to calculate_distance_and_time() and get_route_geometry()
        will hit the OSRM HTTP API instead of a local NetworkX graph.
        Works with the public OSRM demo server or a local Docker container.

        Parameters
        ----------
        base_url : OSRM server root, e.g.
                   'http://router.project-osrm.org'   ← public demo (CH ok)
                   'http://localhost:5000'             ← local Docker container

        Returns
        -------
        True if the server is reachable, False otherwise.
        """
        import urllib.request
        # Quick connectivity check using a Zurich→Bern probe
        test = (f"{base_url.rstrip('/')}/route/v1/driving/"
                "8.5472,47.3769;7.4474,46.9479?overview=false")
        try:
            with urllib.request.urlopen(test, timeout=10) as r:
                import json as _json
                body = _json.loads(r.read())
                if body.get('code') != 'Ok':
                    raise ValueError(f"OSRM returned: {body.get('code')}")
        except Exception as exc:
            logger.warning(f"OSRM not reachable at {base_url}: {exc}")
            return False

        self._osrm_url = base_url.rstrip('/')
        self.graph = None          # signal that we use OSRM, not NetworkX
        self.loaded_regions.add('osrm')
        logger.info(f"✅ OSRM routing active → {self._osrm_url}")
        return True

    # ------------------------------------------------------------------
    # OSRM helpers
    # ------------------------------------------------------------------

    def _osrm_route(self, origin: tuple, destination: tuple,
                    geometry: bool = False) -> dict:
        """
        Call OSRM /route/v1/driving and return the parsed JSON.
        Raises on network or OSRM errors.
        """
        import urllib.request, json as _json
        lon1, lat1 = origin[1],      origin[0]
        lon2, lat2 = destination[1], destination[0]
        overview   = 'full' if geometry else 'false'
        url = (f"{self._osrm_url}/route/v1/driving/"
               f"{lon1},{lat1};{lon2},{lat2}"
               f"?overview={overview}&geometries=geojson")
        with urllib.request.urlopen(url, timeout=15) as r:
            data = _json.loads(r.read())
        if data.get('code') != 'Ok':
            raise ValueError(f"OSRM error: {data.get('code')} – {data.get('message','')}")
        return data

    # ------------------------------------------------------------------
    # osmnx version shim
    # ------------------------------------------------------------------

    @staticmethod
    def _ox_graph_from_bbox(north: float, south: float,
                            east: float, west: float):
        """
        Call ox.graph_from_bbox in a way that works for both v1 and v2.

        osmnx v1  (< 2.0): graph_from_bbox(north, south, east, west, **kw)
        osmnx v2  (≥ 2.0): graph_from_bbox(bbox=[west, south, east, north], **kw)

        The bbox tuple order for v2 follows the GeoJSON / OGC convention:
        (min_lon, min_lat, max_lon, max_lat) = (west, south, east, north).
        """
        major = int(ox.__version__.split('.')[0])
        kw = dict(network_type='drive', simplify=True, retain_all=False)
        if major >= 2:
            return ox.graph_from_bbox(bbox=(west, south, east, north), **kw)
        else:
            return ox.graph_from_bbox(north, south, east, west, **kw)

    def _load(self, cache_key: str, osm_fetcher) -> bool:
        """Internal loader shared by load_region() and load_bbox()."""
        if cache_key in self.loaded_regions:
            logger.info(f"Region '{cache_key}' already loaded")
            return True

        cache_file = self.cache_dir / f"graph_{cache_key}.pkl"

        # 1. Try disk cache first
        if self.use_cache and cache_file.exists():
            logger.info(f"Loading graph from disk: {cache_file}")
            g = self._load_graph(cache_file)
            if g is not None:
                self.graph = g
                self._add_speeds()
                self.loaded_regions.add(cache_key)
                self._node_cache.clear()
                logger.info(f"✅ Loaded from cache – {len(g.nodes):,} nodes, "
                            f"{len(g.edges):,} edges")
                return True

        # 2. Fetch from OSM
        logger.info(f"Downloading road network '{cache_key}' from OpenStreetMap…")
        try:
            g = osm_fetcher()
            self.graph = g
            self._add_speeds()
            self.loaded_regions.add(cache_key)
            self._node_cache.clear()
            logger.info(f"✅ Downloaded – {len(g.nodes):,} nodes, {len(g.edges):,} edges")

            if self.use_cache:
                self._save_graph(cache_file)
            return True

        except Exception as exc:
            logger.warning(f"⚠️  Could not load '{cache_key}': {str(exc)[:120]}")
            logger.info("Falling back to straight-line + road_factor distances.")
            return False

    # ------------------------------------------------------------------
    # Graph persistence helpers
    # ------------------------------------------------------------------

    def _save_graph(self, filepath: Path) -> None:
        self._save_graph_to(self.graph, filepath)

    def _save_graph_to(self, graph, filepath: Path) -> None:
        try:
            with open(filepath, 'wb') as fh:
                pickle.dump(graph, fh, protocol=pickle.HIGHEST_PROTOCOL)
            logger.info(f"💾 Graph saved: {filepath}")
        except Exception as exc:
            logger.warning(f"Could not save graph: {exc}")

    def _load_graph(self, filepath: Path):
        try:
            with open(filepath, 'rb') as fh:
                return pickle.load(fh)
        except Exception as exc:
            logger.warning(f"Could not load graph from disk: {exc}")
            return None

    # ------------------------------------------------------------------
    # Speed / weight annotation
    # ------------------------------------------------------------------

    def _add_speeds(self) -> None:
        """Annotate every edge with speed_kmh, travel_time_h, distance_km."""
        if not self.graph:
            return
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            highway = data.get('highway', 'default')
            if isinstance(highway, list):
                speed = max(self.SPEED_PROFILE.get(h, 50) for h in highway)
            else:
                speed = self.SPEED_PROFILE.get(highway, self.SPEED_PROFILE['default'])

            length_km = data.get('length', 0) / 1000
            travel_time_h = (length_km / speed) if speed > 0 else 0

            self.graph[u][v][k]['speed_kmh'] = speed
            self.graph[u][v][k]['travel_time_h'] = travel_time_h
            self.graph[u][v][k]['distance_km'] = length_km

    # ------------------------------------------------------------------
    # Node lookup (dict-based cache, avoids lru_cache/self ref leak)
    # ------------------------------------------------------------------

    def _find_nearest_node(self, lat: float, lon: float):
        if not self.graph:
            return None
        key = (round(lat, 6), round(lon, 6))
        if key not in self._node_cache:
            try:
                self._node_cache[key] = ox.nearest_nodes(self.graph, lon, lat)
            except Exception:
                self._node_cache[key] = None
        return self._node_cache[key]

    # ------------------------------------------------------------------
    # Core routing
    # ------------------------------------------------------------------

    def calculate_distance_and_time(self, origin: tuple, destination: tuple,
                                    vehicle_profile: str = 'truck_small') -> tuple:
        """
        Return (distance_km, time_hours) between two (lat, lon) points.

        Uses real road routing when a graph is loaded, otherwise falls back
        to straight-line × road_factor.
        """
        cache_key = (origin, destination, vehicle_profile)
        if self.use_cache and cache_key in self.route_cache:
            return self.route_cache[cache_key]

        # ── OSRM path ────────────────────────────────────────────────────
        if hasattr(self, '_osrm_url'):
            try:
                data    = self._osrm_route(origin, destination, geometry=False)
                leg     = data['routes'][0]['legs'][0]
                dist_km = leg['distance'] / 1000
                profile = self.VEHICLE_PROFILES.get(
                    vehicle_profile, self.VEHICLE_PROFILES['truck_small'])
                time_h  = (leg['duration'] / 3600) / profile['speed_factor']
                result  = (dist_km, time_h)
                if self.use_cache:
                    self.route_cache[cache_key] = result
                return result
            except Exception as exc:
                logger.debug(f"OSRM routing error: {exc} – using fallback")
                return self._fallback_distance(origin, destination, vehicle_profile)

        if not self.graph:
            result = self._fallback_distance(origin, destination, vehicle_profile)
            if self.use_cache:
                self.route_cache[cache_key] = result
            return result

        try:
            o_node = self._find_nearest_node(*origin)
            d_node = self._find_nearest_node(*destination)

            if o_node is None or d_node is None:
                return self._fallback_distance(origin, destination, vehicle_profile)

            try:
                path = nx.shortest_path(
                    self.graph, o_node, d_node, weight='travel_time_h'
                )
            except nx.NetworkXNoPath:
                return self._fallback_distance(origin, destination, vehicle_profile)

            distance_km = 0.0
            time_h = 0.0
            for i in range(len(path) - 1):
                u, v = path[i], path[i + 1]
                # MultiDiGraph: graph[u][v] is {key: data_dict}; pick key 0
                edge_data = self.graph[u][v][0]
                distance_km += edge_data.get('distance_km', 0)
                time_h      += edge_data.get('travel_time_h', 0)

            profile = self.VEHICLE_PROFILES.get(
                vehicle_profile, self.VEHICLE_PROFILES['truck_small']
            )
            result = (distance_km, time_h / profile['speed_factor'])

        except Exception as exc:
            logger.debug(f"Routing error: {str(exc)[:100]} – using fallback")
            result = self._fallback_distance(origin, destination, vehicle_profile)

        if self.use_cache:
            self.route_cache[cache_key] = result
        return result

    def _fallback_distance(self, origin: tuple, destination: tuple,
                           vehicle_profile: str = 'truck_small') -> tuple:
        """Straight-line distance scaled by road_factor."""
        air_dist = geodesic(origin, destination).km
        road_dist = air_dist * self.road_factor
        profile = self.VEHICLE_PROFILES.get(
            vehicle_profile, self.VEHICLE_PROFILES['truck_small']
        )
        avg_speed = 55 * profile['speed_factor']
        return (road_dist, road_dist / avg_speed)

    # ------------------------------------------------------------------
    # Batch helpers
    # ------------------------------------------------------------------

    def calculate_distance_matrix(self, locations_dict: dict,
                                  vehicle_profile: str = 'truck_small') -> tuple:
        """
        Compute full distance and time matrices for a dict of locations.

        Parameters
        ----------
        locations_dict : {name: (lat, lon), …}
        vehicle_profile: one of 'van', 'truck_small', 'truck_large'

        Returns
        -------
        (df_distances_km, df_times_hours)  – both are pandas DataFrames
        """
        names = list(locations_dict.keys())
        n = len(names)
        distances = np.zeros((n, n))
        times     = np.zeros((n, n))

        logger.info(f"Computing {n}×{n} distance matrix…")
        for i in range(n):
            for j in range(n):
                if i != j:
                    d, t = self.calculate_distance_and_time(
                        locations_dict[names[i]],
                        locations_dict[names[j]],
                        vehicle_profile
                    )
                    distances[i, j] = d
                    times[i, j]     = t
            logger.info(f"  row {i+1}/{n} done")

        return (
            pd.DataFrame(distances, index=names, columns=names),
            pd.DataFrame(times,     index=names, columns=names),
        )

    def get_route_geometry(self, origin: tuple, destination: tuple) -> list:
        """
        Return a list of (lat, lon) waypoints along the road route.
        Uses OSRM when active, NetworkX graph if loaded, else straight line.
        """
        if hasattr(self, '_osrm_url'):
            try:
                data   = self._osrm_route(origin, destination, geometry=True)
                coords = data['routes'][0]['geometry']['coordinates']
                # GeoJSON is [lon, lat]; Folium/routing expects (lat, lon)
                return [(lat, lon) for lon, lat in coords]
            except Exception as exc:
                logger.debug(f"OSRM geometry error: {exc} – falling back")
                return [origin, destination]

        if not self.graph:
            return [origin, destination]
        try:
            o_node = self._find_nearest_node(*origin)
            d_node = self._find_nearest_node(*destination)
            if o_node is None or d_node is None:
                return [origin, destination]
            path = nx.shortest_path(
                self.graph, o_node, d_node, weight='travel_time_h'
            )
            return [
                (self.graph.nodes[n]['y'], self.graph.nodes[n]['x'])
                for n in path
            ]
        except Exception:
            return [origin, destination]

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def get_statistics(self) -> dict:
        if not self.graph:
            return {'status': 'no_graph_loaded'}

        # Correct MultiDiGraph accessor: graph[u][v][key]['distance_km']
        total_dist = sum(
            data.get('distance_km', 0)
            for u, v, data in self.graph.edges(data=True)
        )
        return {
            'nodes':                    len(self.graph.nodes()),
            'edges':                    len(self.graph.edges()),
            'total_network_distance_km': round(total_dist, 1),
            'regions_loaded':           list(self.loaded_regions),
            'route_cache_size':         len(self.route_cache),
            'node_cache_size':          len(self._node_cache),
        }
