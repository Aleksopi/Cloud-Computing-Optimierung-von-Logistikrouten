"""
Settings API — CRUD for VehicleFleetConfig and SystemConfig.
Changes are applied at the next pipeline Step 3/4 execution.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.models import SystemConfig, VehicleFleetConfig
from app.db.session import SessionLocal
from app.services.traffic import current_congestion, effective_factor, hourly_profile

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class VehicleBody(BaseModel):
    name: str
    vehicle_class: str | None = None   # legacy, optional
    can_last_mile: bool = False        # usable Hub → Apotheke
    can_backbone: bool = False         # usable HQ → Hub / VZ → mVZ
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


class TrafficBody(BaseModel):
    """Toggle live traffic and (optionally) tune its peak intensity."""
    enabled: bool
    peak_intensity: float | None = None


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


# ── Live-traffic endpoints ────────────────────────────────────────────────────

@router.get("/traffic")
def get_traffic():
    db = SessionLocal()
    try:
        return _traffic_payload({c.key: c.value for c in db.query(SystemConfig).all()})
    finally:
        db.close()


@router.put("/traffic")
def update_traffic(body: TrafficBody):
    db = SessionLocal()
    try:
        _upsert(db, "live_traffic_enabled", "1" if body.enabled else "0")
        if body.peak_intensity is not None:
            _upsert(db, "traffic_peak_intensity", str(round(max(0.0, body.peak_intensity), 2)))
        db.commit()
        return _traffic_payload({c.key: c.value for c in db.query(SystemConfig).all()})
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _upsert(db, key: str, value: str) -> None:
    row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SystemConfig(key=key, value=value))


def _traffic_payload(raw: dict[str, str]) -> dict:
    def _f(key: str, default: float) -> float:
        try:
            return float(raw.get(key, default))
        except (TypeError, ValueError):
            return default

    enabled       = _f("live_traffic_enabled", 0.0) >= 0.5
    peak          = _f("traffic_peak_intensity", 1.0)
    static_factor = _f("traffic_factor", 1.0)
    shift_start   = _f("shift_start", 8.0)
    shift_hours   = _f("shift_hours", 8.0)
    return {
        "enabled":            enabled,
        "peak_intensity":     round(peak, 2),
        "static_factor":      round(static_factor, 3),
        "effective_factor":   effective_factor(
            enabled=enabled, static_factor=static_factor,
            shift_start=shift_start, shift_hours=shift_hours, peak_intensity=peak,
        ),
        "current_congestion": current_congestion(peak),
        "shift_start":        shift_start,
        "shift_hours":        shift_hours,
        "profile":            hourly_profile(peak),
    }


def _vehicle_dict(v: VehicleFleetConfig) -> dict:
    return {
        "id":                v.id,
        "name":              v.name,
        "vehicle_class":     v.vehicle_class,
        "can_last_mile":     bool(v.can_last_mile),
        "can_backbone":      bool(v.can_backbone),
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
