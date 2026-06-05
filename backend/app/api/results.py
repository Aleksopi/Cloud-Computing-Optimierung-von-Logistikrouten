from fastapi import APIRouter
from sqlalchemy import or_

from app.db.models import Assignment, Hub, Pharmacy, VehicleRoute
from app.db.session import SessionLocal
from app.pipeline.a4_routes import (
    EVAN_CAPACITY, EVAN_RANGE_KM, EVAN_COST_PER_KM, EVAN_CO2_G_PER_KM,
    EVAN_SPEED_KMH, EVAN_DRIVER_CHF_H, EVAN_SERVICE_MIN,
    LKW_CAPACITY, LKW_RANGE_KM, LKW_COST_PER_KM, LKW_CO2_G_PER_KM,
    LKW_SPEED_KMH, LKW_DRIVER_CHF_H, LKW_SERVICE_MIN,
    BACKBONE_COST_PER_KM, BACKBONE_CO2_G_PER_KM, BACKBONE_SPEED_KMH,
    OPT_WEIGHT_COST, OPT_WEIGHT_TIME, OPT_WEIGHT_ENV,
    TRAFFIC_FACTOR, CO2_SHADOW_CHF_PER_KG, SHIFT_HOURS,
)

router = APIRouter()


@router.get("/pharmacies")
def get_pharmacies():
    db = SessionLocal()
    try:
        rows = db.query(Pharmacy).all()
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [p.lon, p.lat]},
                    "properties": {
                        "id": p.id,
                        "name": p.name or "",
                        "city": p.city or "",
                        "demand": p.demand,
                        "hub_name": p.hub_name,
                    },
                }
                for p in rows
            ],
        }
    finally:
        db.close()


@router.get("/hubs")
def get_hubs():
    db = SessionLocal()
    try:
        rows = db.query(Hub).all()
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                    "properties": {
                        "id": h.id,
                        "name": h.name,
                        "hub_type": h.hub_type,
                        "parent_hub": h.parent_hub,
                    },
                }
                for h in rows
            ],
        }
    finally:
        db.close()


@router.get("/assignments")
def get_assignments():
    db = SessionLocal()
    try:
        rows = db.query(Assignment).all()
        features = []
        for a in rows:
            if a.route_geometry and len(a.route_geometry) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": a.route_geometry},
                        "properties": {
                            "pharmacy_id": a.pharmacy_id,
                            "hub_name": a.hub_name,
                            "distance_km": a.distance_km,
                            "travel_time_h": a.travel_time_h,
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/routes")
def get_routes():
    db = SessionLocal()
    try:
        rows = db.query(VehicleRoute).filter(
            or_(VehicleRoute.supply_tier == "last_mile", VehicleRoute.supply_tier == None)  # noqa: E711
        ).all()
        features = []
        for r in rows:
            if r.stop_coords and len(r.stop_coords) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": r.stop_coords},
                        "properties": {
                            "id": r.id,
                            "hub_name": r.hub_name,
                            "vehicle_id": r.vehicle_id,
                            "vehicle_type": r.vehicle_type,
                            "total_km": r.total_km,
                            "total_hours": r.total_hours,
                            "total_items": r.total_items,
                            "total_cost_chf": r.total_cost_chf,
                            "co2_kg": r.co2_kg,
                            "stop_count": len(r.stops) if r.stops else 0,
                            "restock_count": r.restock_count,
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/backbone")
def get_backbone():
    db = SessionLocal()
    try:
        rows = db.query(VehicleRoute).filter(VehicleRoute.supply_tier == "backbone").all()
        features = []
        for r in rows:
            if r.stop_coords and len(r.stop_coords) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": r.stop_coords},
                        "properties": {
                            "id": r.id,
                            "hub_name": r.hub_name,
                            "vehicle_id": r.vehicle_id,
                            "vehicle_type": r.vehicle_type,
                            "total_km": r.total_km,
                            "total_hours": r.total_hours,
                            "total_items": r.total_items,
                            "total_cost_chf": r.total_cost_chf,
                            "co2_kg": r.co2_kg,
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/summary")
def get_summary():
    db = SessionLocal()
    try:
        pharmacies = db.query(Pharmacy).all()
        routes = db.query(VehicleRoute).all()
        hubs = db.query(Hub).count()
        return {
            "hubs": hubs,
            "pharmacies_total": len(pharmacies),
            "pharmacies_assigned": sum(1 for p in pharmacies if p.hub_name),
            "total_demand": sum(p.demand or 0 for p in pharmacies),
            "total_routes": len(routes),
            "total_cost_chf": round(sum(r.total_cost_chf or 0 for r in routes), 2),
            "total_km": round(sum(r.total_km or 0 for r in routes), 2),
            "evan_routes": sum(1 for r in routes if r.vehicle_type == "EVan"),
            "lkw_routes": sum(1 for r in routes if r.vehicle_type == "LKW"),
        }
    finally:
        db.close()


@router.get("/summary/full")
def get_full_summary():
    """Detailed summary for the analytics dashboard page."""
    db = SessionLocal()
    try:
        pharmacies = db.query(Pharmacy).all()
        all_hubs   = db.query(Hub).all()
        all_routes = db.query(VehicleRoute).all()

        last_mile  = [r for r in all_routes if r.supply_tier in (None, "last_mile")]
        backbone   = [r for r in all_routes if r.supply_tier == "backbone"]
        evan_routes = [r for r in last_mile if r.vehicle_type == "EVan"]
        lkw_routes  = [r for r in last_mile if r.vehicle_type == "LKW"]

        def fleet_stats(rs: list) -> dict:
            return {
                "count":          len(rs),
                "total_km":       round(sum(r.total_km       or 0 for r in rs), 2),
                "total_hours":    round(sum(r.total_hours     or 0 for r in rs), 2),
                "total_cost_chf": round(sum(r.total_cost_chf or 0 for r in rs), 2),
                "total_co2_kg":   round(sum(r.co2_kg         or 0 for r in rs), 3),
                "total_items":    sum(r.total_items or 0 for r in rs),
            }

        hq      = next((h for h in all_hubs if h.hub_type == "HQ"), None)
        vz_list = [h for h in all_hubs if h.hub_type == "VZ"]
        mvz_list = [h for h in all_hubs if h.hub_type == "mVZ"]

        pharm_by_hub: dict[str, list] = {}
        for p in pharmacies:
            if p.hub_name:
                pharm_by_hub.setdefault(p.hub_name, []).append(p)

        def _hav(lat1, lon1, lat2, lon2) -> float:
            import math
            R = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
            return R * 2 * math.asin(min(1, a**0.5))

        hierarchy = []
        for vz in vz_list:
            vz_mvzs     = [m for m in mvz_list if m.parent_hub == vz.name]
            vz_pharmas  = pharm_by_hub.get(vz.name, [])
            mvz_pharmas = sum(len(pharm_by_hub.get(m.name, [])) for m in vz_mvzs)
            hq_dist     = _hav(hq.lat, hq.lon, vz.lat, vz.lon) if hq else 0
            bb_hq_vz    = next(
                (r for r in backbone if r.hub_name == (hq.name if hq else "") and vz.name in r.vehicle_id), None
            )
            vz_stats: dict = {
                "name":              vz.name,
                "direct_pharmacies": len(vz_pharmas),
                "mvz_count":         len(vz_mvzs),
                "total_pharmacies":  len(vz_pharmas) + mvz_pharmas,
                "total_items":       (sum(p.demand or 0 for p in vz_pharmas)
                                      + sum(p.demand or 0 for p in pharmacies if any(
                                          p.hub_name == m.name for m in vz_mvzs))),
                "distance_to_hq_km": round(hq_dist, 1),
                "backbone_km":       round(bb_hq_vz.total_km, 1) if bb_hq_vz else None,
                "backbone_cost_chf": round(bb_hq_vz.total_cost_chf, 2) if bb_hq_vz else None,
                "backbone_co2_kg":   round(bb_hq_vz.co2_kg, 3) if bb_hq_vz and bb_hq_vz.co2_kg else None,
                "mvz": [],
            }
            for mvz in vz_mvzs:
                mvz_pharmas_list = pharm_by_hub.get(mvz.name, [])
                bb_vz_mvz = next(
                    (r for r in backbone if r.hub_name == vz.name and mvz.name in r.vehicle_id), None
                )
                vz_stats["mvz"].append({
                    "name":            mvz.name,
                    "pharmacy_count":  len(mvz_pharmas_list),
                    "total_items":     sum(p.demand or 0 for p in mvz_pharmas_list),
                    "backbone_km":     round(bb_vz_mvz.total_km, 1)       if bb_vz_mvz else None,
                    "backbone_cost_chf": round(bb_vz_mvz.total_cost_chf, 2) if bb_vz_mvz else None,
                    "backbone_co2_kg": round(bb_vz_mvz.co2_kg, 3)         if bb_vz_mvz and bb_vz_mvz.co2_kg else None,
                })
            hierarchy.append(vz_stats)

        total_co2  = round(sum(r.co2_kg or 0 for r in all_routes), 2)
        total_cost = round(sum(r.total_cost_chf or 0 for r in all_routes), 2)
        total_km   = round(sum(r.total_km or 0 for r in all_routes), 2)

        return {
            "overview": {
                "total_cost_chf":       total_cost,
                "total_co2_kg":         total_co2,
                "total_km":             total_km,
                "total_last_mile_routes": len(last_mile),
                "pharmacies_total":     len(pharmacies),
                "pharmacies_assigned":  sum(1 for p in pharmacies if p.hub_name),
                "hubs_total":           len(all_hubs),
            },
            "fleet": {
                "evan":     fleet_stats(evan_routes),
                "lkw":      fleet_stats(lkw_routes),
                "backbone": fleet_stats(backbone),
            },
            "vehicle_specs": {
                "evan": {
                    "capacity":       EVAN_CAPACITY,
                    "range_km":       EVAN_RANGE_KM,
                    "cost_per_km":    EVAN_COST_PER_KM,
                    "co2_g_per_km":   EVAN_CO2_G_PER_KM,
                    "speed_kmh":      EVAN_SPEED_KMH,
                    "driver_chf_h":   EVAN_DRIVER_CHF_H,
                    "service_min":    EVAN_SERVICE_MIN,
                    "label":          "Mercedes eSprinter (elektrisch)",
                },
                "lkw": {
                    "capacity":       LKW_CAPACITY,
                    "range_km":       LKW_RANGE_KM,
                    "cost_per_km":    LKW_COST_PER_KM,
                    "co2_g_per_km":   LKW_CO2_G_PER_KM,
                    "speed_kmh":      LKW_SPEED_KMH,
                    "driver_chf_h":   LKW_DRIVER_CHF_H,
                    "service_min":    LKW_SERVICE_MIN,
                    "label":          "7.5 t Diesel-LKW",
                },
                "backbone": {
                    "cost_per_km":    BACKBONE_COST_PER_KM,
                    "co2_g_per_km":   BACKBONE_CO2_G_PER_KM,
                    "speed_kmh":      BACKBONE_SPEED_KMH,
                    "label":          "20 t Sattelzug",
                },
            },
            "optimization": {
                "weights": {
                    "cost":        OPT_WEIGHT_COST,
                    "time":        OPT_WEIGHT_TIME,
                    "environment": OPT_WEIGHT_ENV,
                },
                "traffic_factor":        TRAFFIC_FACTOR,
                "co2_shadow_chf_per_kg": CO2_SHADOW_CHF_PER_KG,
                "shift_hours":           SHIFT_HOURS,
            },
            "supply_chain": {
                "hq_name":       hq.name if hq else None,
                "vz_count":      len(vz_list),
                "mvz_count":     len(mvz_list),
                "pharmacy_count": len(pharmacies),
                "hierarchy":     hierarchy,
            },
        }
    finally:
        db.close()
