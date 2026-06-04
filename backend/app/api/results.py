from fastapi import APIRouter

from app.db.models import Assignment, Hub, Pharmacy, VehicleRoute
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
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                    "properties": {"id": h.id, "name": h.name, "hub_type": h.hub_type},
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
        rows = db.query(VehicleRoute).all()
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
                            "stop_count": len(r.stops) if r.stops else 0,
                            "restock_count": r.restock_count,
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
