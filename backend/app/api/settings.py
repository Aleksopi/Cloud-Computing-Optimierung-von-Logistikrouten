"""
Settings API — CRUD for VehicleFleetConfig and SystemConfig.
Changes are applied at the next pipeline Step 3/4 execution.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.models import SystemConfig, VehicleFleetConfig
from app.db.session import SessionLocal

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class VehicleBody(BaseModel):
    name: str
    vehicle_class: str            # "delivery" or "backbone"
    capacity: int | None = None
    range_km: float
    cost_per_km: float
    co2_g_per_km: float
    speed_kmh: float
    driver_chf_h: float | None = None
    service_min: int | None = None
    max_per_hub: int | None = None
    restock_threshold: int | None = None
    sort_order: int = 0
    enabled: bool = True


class SystemConfigBody(BaseModel):
    """Bulk-update: key → value mapping (string values)."""
    updates: dict[str, str]


# ── Vehicle endpoints ─────────────────────────────────────────────────────────

@router.get("/vehicles")
def list_vehicles():
    db = SessionLocal()
    try:
        rows = db.query(VehicleFleetConfig).order_by(VehicleFleetConfig.sort_order).all()
        return [_vehicle_dict(v) for v in rows]
    finally:
        db.close()


@router.post("/vehicles", status_code=201)
def create_vehicle(body: VehicleBody):
    db = SessionLocal()
    try:
        v = VehicleFleetConfig(**body.model_dump())
        db.add(v)
        db.commit()
        db.refresh(v)
        return _vehicle_dict(v)
    finally:
        db.close()


@router.put("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: int, body: VehicleBody):
    db = SessionLocal()
    try:
        v = db.query(VehicleFleetConfig).filter(VehicleFleetConfig.id == vehicle_id).first()
        if not v:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        for field, val in body.model_dump().items():
            setattr(v, field, val)
        db.commit()
        db.refresh(v)
        return _vehicle_dict(v)
    finally:
        db.close()


@router.delete("/vehicles/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: int):
    db = SessionLocal()
    try:
        v = db.query(VehicleFleetConfig).filter(VehicleFleetConfig.id == vehicle_id).first()
        if not v:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        db.delete(v)
        db.commit()
    finally:
        db.close()


# ── System config endpoints ───────────────────────────────────────────────────

@router.get("/system")
def get_system_config():
    db = SessionLocal()
    try:
        rows = db.query(SystemConfig).all()
        return [_config_dict(c) for c in rows]
    finally:
        db.close()


@router.put("/system")
def update_system_config(body: SystemConfigBody):
    db = SessionLocal()
    try:
        for key, value in body.updates.items():
            row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
            if row:
                row.value = str(value)
            else:
                db.add(SystemConfig(key=key, value=str(value)))
        db.commit()
        rows = db.query(SystemConfig).all()
        return [_config_dict(c) for c in rows]
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _vehicle_dict(v: VehicleFleetConfig) -> dict:
    return {
        "id":                v.id,
        "name":              v.name,
        "vehicle_class":     v.vehicle_class,
        "capacity":          v.capacity,
        "range_km":          v.range_km,
        "cost_per_km":       v.cost_per_km,
        "co2_g_per_km":      v.co2_g_per_km,
        "speed_kmh":         v.speed_kmh,
        "driver_chf_h":      v.driver_chf_h,
        "service_min":       v.service_min,
        "max_per_hub":       v.max_per_hub,
        "restock_threshold": v.restock_threshold,
        "sort_order":        v.sort_order,
        "enabled":           v.enabled,
    }


def _config_dict(c: SystemConfig) -> dict:
    return {
        "key":         c.key,
        "value":       c.value,
        "label":       c.label,
        "description": c.description,
    }
