"""
utils.py – Shared engine singleton for steps 2–5.

    from utils import utils
    engine = utils.engine
    dist, time = engine.distance_and_time((47.37, 8.54), (46.94, 7.44))
    df_d, df_t = engine.distance_matrix(locations_dict)
    result     = engine.solve_vrp(depot, deliveries, vehicles)
    result     = engine.solve_tsp(locations, depot)
    result     = engine.solve_assignment(pharmacies, hubs, hub_weights)
"""

from routing_engine import RoutingEngine
from log import logger

OSRM_URL = "http://osrm:5000"


class utils:
    engine: RoutingEngine = None

    @classmethod
    def _init(cls) -> None:
        if cls.engine is not None:
            return
        logger.info(f"[utils] Connecting to OSRM at {OSRM_URL} …")
        cls.engine = RoutingEngine(
            osrm_url   = OSRM_URL,
            use_cache  = True,
            road_factor= 1.25,
        )
        cls.engine.ping()   # logs ✅ or ⚠️ immediately on import


utils._init()
