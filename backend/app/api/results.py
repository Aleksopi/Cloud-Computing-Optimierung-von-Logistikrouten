from collections import defaultdict

from fastapi import APIRouter
from sqlalchemy import or_

from app.db.models import Assignment, Hub, Pharmacy, SystemConfig, VehicleFleetConfig, VehicleRoute
from app.db.session import SessionLocal

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

        # Build route stats per hub for InfoSidebar enrichment
        route_stats: dict[str, dict] = defaultdict(
            lambda: {"vehicle_counts": {}, "total_items": 0, "total_km": 0.0}
        )
        for r in db.query(VehicleRoute).filter(
            or_(VehicleRoute.supply_tier == "last_mile", VehicleRoute.supply_tier == None)  # noqa: E711
        ).all():
            s = route_stats[r.hub_name]
            vt = r.vehicle_type or "—"
            s["vehicle_counts"][vt] = s["vehicle_counts"].get(vt, 0) + 1
            s["total_items"] += r.total_items or 0
            s["total_km"]    += r.total_km or 0

        sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
        shift_h = float(sys_raw.get("shift_hours", "8.0"))
        # Estimate delivery window based on shift start 08:00
        import datetime
        start = datetime.time(8, 0)
        end_h = 8 + int(shift_h)
        end   = datetime.time(min(end_h, 23), 0)
        delivery_window = f"{start.strftime('%H:%M')} – {end.strftime('%H:%M')} Uhr"

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                    "properties": {
                        "id":              h.id,
                        "name":            h.name,
                        "hub_type":        h.hub_type,
                        "parent_hub":      h.parent_hub,
                        # Route stats (available after Step 4)
                        "vehicle_counts":  route_stats[h.name]["vehicle_counts"],
                        "total_items":     route_stats[h.name]["total_items"],
                        "total_km":        round(route_stats[h.name]["total_km"], 1),
                        "delivery_window": delivery_window,
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
        hq = db.query(Hub).filter(Hub.hub_type == "HQ").first()
        hq_name = hq.name if hq else ""
        rows = db.query(VehicleRoute).filter(VehicleRoute.supply_tier == "backbone").all()
        features = []
        for r in rows:
            if r.stop_coords and len(r.stop_coords) >= 2:
                # tier: "hq_vz" for HQ→VZ routes, "vz_mvz" for VZ→mVZ routes
                tier = "hq_vz" if r.hub_name == hq_name else "vz_mvz"
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": r.stop_coords},
                        "properties": {
                            "id":            r.id,
                            "hub_name":      r.hub_name,
                            "vehicle_id":    r.vehicle_id,
                            "vehicle_type":  r.vehicle_type,
                            "backbone_tier": tier,
                            "total_km":      r.total_km,
                            "total_hours":   r.total_hours,
                            "total_items":   r.total_items,
                            "total_cost_chf": r.total_cost_chf,
                            "co2_kg":        r.co2_kg,
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
    """Detailed summary for the analytics dashboard page — reads all specs from DB."""
    import math
    db = SessionLocal()
    try:
        pharmacies = db.query(Pharmacy).all()
        all_hubs   = db.query(Hub).all()
        all_routes = db.query(VehicleRoute).all()
        vehicles   = db.query(VehicleFleetConfig).order_by(VehicleFleetConfig.sort_order).all()
        sys_raw    = {c.key: c.value for c in db.query(SystemConfig).all()}

        last_mile = [r for r in all_routes if r.supply_tier in (None, "last_mile")]
        backbone  = [r for r in all_routes if r.supply_tier == "backbone"]

        # Fleet stats per vehicle type
        type_stats: dict[str, dict] = {}
        for r in last_mile:
            vt = r.vehicle_type or "—"
            if vt not in type_stats:
                type_stats[vt] = {"count": 0, "total_km": 0.0, "total_hours": 0.0,
                                   "total_cost_chf": 0.0, "total_co2_kg": 0.0, "total_items": 0}
            s = type_stats[vt]
            s["count"]          += 1
            s["total_km"]       += r.total_km       or 0
            s["total_hours"]    += r.total_hours     or 0
            s["total_cost_chf"] += r.total_cost_chf or 0
            s["total_co2_kg"]   += r.co2_kg         or 0
            s["total_items"]    += r.total_items     or 0

        def _fleet_stats(rs):
            return {
                "count":          len(rs),
                "total_km":       round(sum(r.total_km       or 0 for r in rs), 2),
                "total_hours":    round(sum(r.total_hours     or 0 for r in rs), 2),
                "total_cost_chf": round(sum(r.total_cost_chf or 0 for r in rs), 2),
                "total_co2_kg":   round(sum(r.co2_kg         or 0 for r in rs), 3),
                "total_items":    sum(r.total_items or 0 for r in rs),
            }

        def _hav(lat1, lon1, lat2, lon2):
            R = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
            return R * 2 * math.asin(min(1.0, math.sqrt(max(0.0, a))))

        hq       = next((h for h in all_hubs if h.hub_type == "HQ"), None)
        vz_list  = [h for h in all_hubs if h.hub_type == "VZ"]
        mvz_list = [h for h in all_hubs if h.hub_type == "mVZ"]
        pharm_by_hub: dict[str, list] = {}
        for p in pharmacies:
            if p.hub_name:
                pharm_by_hub.setdefault(p.hub_name, []).append(p)

        hierarchy = []
        for vz in vz_list:
            vz_mvzs    = [m for m in mvz_list if m.parent_hub == vz.name]
            vz_pharmas = pharm_by_hub.get(vz.name, [])
            mvz_count  = sum(len(pharm_by_hub.get(m.name, [])) for m in vz_mvzs)
            hq_dist    = _hav(hq.lat, hq.lon, vz.lat, vz.lon) if hq else 0
            bb_hq_vz   = next((r for r in backbone
                                if r.hub_name == (hq.name if hq else "") and vz.name in (r.vehicle_id or "")), None)
            vz_stat: dict = {
                "name":              vz.name,
                "direct_pharmacies": len(vz_pharmas),
                "mvz_count":         len(vz_mvzs),
                "total_pharmacies":  len(vz_pharmas) + mvz_count,
                "total_items":       (sum(p.demand or 0 for p in vz_pharmas)
                                      + sum(p.demand or 0 for p in pharmacies
                                            if any(p.hub_name == m.name for m in vz_mvzs))),
                "distance_to_hq_km": round(hq_dist, 1),
                "backbone_km":       round(bb_hq_vz.total_km, 1)       if bb_hq_vz else None,
                "backbone_cost_chf": round(bb_hq_vz.total_cost_chf, 2) if bb_hq_vz else None,
                "backbone_co2_kg":   round(bb_hq_vz.co2_kg, 3)         if (bb_hq_vz and bb_hq_vz.co2_kg) else None,
                "mvz": [],
            }
            for mvz in vz_mvzs:
                mvz_p     = pharm_by_hub.get(mvz.name, [])
                bb_vz_mvz = next((r for r in backbone
                                   if r.hub_name == vz.name and mvz.name in (r.vehicle_id or "")), None)
                vz_stat["mvz"].append({
                    "name":            mvz.name,
                    "pharmacy_count":  len(mvz_p),
                    "total_items":     sum(p.demand or 0 for p in mvz_p),
                    "backbone_km":       round(bb_vz_mvz.total_km, 1)       if bb_vz_mvz else None,
                    "backbone_cost_chf": round(bb_vz_mvz.total_cost_chf, 2) if bb_vz_mvz else None,
                    "backbone_co2_kg":   round(bb_vz_mvz.co2_kg, 3)         if (bb_vz_mvz and bb_vz_mvz.co2_kg) else None,
                })
            hierarchy.append(vz_stat)

        return {
            "overview": {
                "total_cost_chf":          round(sum(r.total_cost_chf or 0 for r in all_routes), 2),
                "total_co2_kg":            round(sum(r.co2_kg or 0 for r in all_routes), 2),
                "total_km":                round(sum(r.total_km or 0 for r in all_routes), 2),
                "total_last_mile_routes":  len(last_mile),
                "pharmacies_total":        len(pharmacies),
                "pharmacies_assigned":     sum(1 for p in pharmacies if p.hub_name),
                "hubs_total":              len(all_hubs),
            },
            "fleet_by_type":  {vt: {**s, "total_km": round(s["total_km"], 2),
                                         "total_hours": round(s["total_hours"], 2),
                                         "total_cost_chf": round(s["total_cost_chf"], 2),
                                         "total_co2_kg": round(s["total_co2_kg"], 3)}
                                for vt, s in type_stats.items()},
            "fleet": {
                "last_mile": _fleet_stats(last_mile),
                "backbone":  _fleet_stats(backbone),
            },
            "vehicle_specs": [
                {
                    "id": v.id, "name": v.name, "vehicle_class": v.vehicle_class,
                    "capacity": v.capacity, "range_km": v.range_km,
                    "cost_per_km": v.cost_per_km, "co2_g_per_km": v.co2_g_per_km,
                    "speed_kmh": v.speed_kmh, "driver_chf_h": v.driver_chf_h,
                    "service_min": v.service_min, "max_per_hub": v.max_per_hub,
                    "enabled": v.enabled,
                }
                for v in vehicles
            ],
            "optimization": {
                "weights": {
                    "cost":        float(sys_raw.get("opt_weight_cost", "0.40")),
                    "time":        float(sys_raw.get("opt_weight_time", "0.35")),
                    "environment": float(sys_raw.get("opt_weight_env",  "0.25")),
                },
                "traffic_factor":        float(sys_raw.get("traffic_factor",  "1.0")),
                "co2_shadow_chf_per_kg": float(sys_raw.get("co2_shadow_chf",  "0.12")),
                "shift_hours":           float(sys_raw.get("shift_hours",      "8.0")),
            },
            "supply_chain": {
                "hq_name":        hq.name if hq else None,
                "vz_count":       len(vz_list),
                "mvz_count":      len(mvz_list),
                "pharmacy_count": len(pharmacies),
                "hierarchy":      hierarchy,
            },
        }
    finally:
        db.close()
