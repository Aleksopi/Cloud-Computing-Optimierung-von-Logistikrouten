from sqlalchemy import Boolean, Column, Integer, String, Float, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Pharmacy(Base):
    __tablename__ = "pharmacies"
    id = Column(Integer, primary_key=True)
    osm_id = Column(String, nullable=True)
    name = Column(String, default="")
    city = Column(String, default="")
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    demand = Column(Integer, nullable=True)
    hub_name = Column(String, nullable=True)
    open_hour  = Column(Float, nullable=True)   # e.g. 8.0 = 08:00
    close_hour = Column(Float, nullable=True)   # e.g. 18.5 = 18:30
    # Why a hub-assigned pharmacy could not be routed in Step 4 (None = delivered).
    undeliverable_reason = Column(String, nullable=True)


class Hub(Base):
    __tablename__ = "hubs"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    hub_type = Column(String, nullable=False)  # HQ, VZ, mVZ
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    parent_hub = Column(String, nullable=True)  # mVZ → nearest VZ name
    capacity   = Column(Integer, nullable=True) # warehouse capacity in goods units
    open_hour  = Column(Float,   nullable=True) # e.g. 7.0 = 07:00
    close_hour = Column(Float,   nullable=True) # e.g. 20.0 = 20:00
    # Per-hub delivery shift (each city its own) — seeded from global config
    shift_start = Column(Float, nullable=True)  # e.g. 8.0 = 08:00 dispatch
    shift_hours = Column(Float, nullable=True)  # max driving hours per shift
    # Location-dependent warehouse operating cost (CHF), set at placement time
    warehouse_cost = Column(Float, nullable=True)


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False)
    hub_name = Column(String, nullable=False)
    distance_km = Column(Float, nullable=True)
    travel_time_h = Column(Float, nullable=True)
    route_geometry = Column(JSON, nullable=True)  # [[lon, lat], ...]


class VehicleRoute(Base):
    __tablename__ = "vehicle_routes"
    id = Column(Integer, primary_key=True)
    hub_name = Column(String, nullable=False)
    vehicle_id = Column(String, nullable=False)
    vehicle_type = Column(String, nullable=False)  # EVan, LKW, Backbone
    stops = Column(JSON, nullable=True)             # [pharmacy_id, ...]
    stop_coords = Column(JSON, nullable=True)       # [[lon, lat], ...]
    total_km = Column(Float, nullable=True)
    total_hours = Column(Float, nullable=True)
    total_items = Column(Integer, nullable=True)
    total_cost_chf = Column(Float, nullable=True)
    restock_count = Column(Integer, default=0)
    supply_tier = Column(String, nullable=True)     # "last_mile" or "backbone"
    co2_kg = Column(Float, nullable=True)           # kg CO2 for this route
    # Traffic context applied to this route (Step 4)
    traffic_factor = Column(Float, nullable=True)   # realised drive-time multiplier vs free flow
    traffic_source = Column(String, nullable=True)  # "tomtom" | "simulation" | "static"
    free_flow_hours = Column(Float, nullable=True)  # drive hours without any congestion
    # Set when this route was added by the forced "alle beliefern" pass (Step 4),
    # which ignores shift/opening-hours limits to guarantee delivery.
    forced = Column(Boolean, default=False)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    id = Column(Integer, primary_key=True)
    step = Column(Integer, unique=True, nullable=False)
    status = Column(String, default="idle")  # idle, running, done, error
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)


class PopulationCell(Base):
    __tablename__ = "population_cells"
    id = Column(Integer, primary_key=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    population = Column(Integer, nullable=False)


class VehicleFleetConfig(Base):
    """Configurable vehicle fleet — read by Step 4 at runtime."""
    __tablename__ = "vehicle_fleet_configs"
    id                = Column(Integer, primary_key=True)
    name              = Column(String, nullable=False)         # display name & vehicle_type key
    vehicle_class     = Column(String, nullable=True)          # legacy; kept for compat
    can_last_mile     = Column(Boolean, default=False)         # usable Hub → Apotheke
    can_backbone      = Column(Boolean, default=False)         # usable HQ → Hub / VZ → mVZ
    capacity          = Column(Integer, nullable=True)         # items per load (None = unlimited)
    range_km          = Column(Float, nullable=False)
    cost_per_km       = Column(Float, nullable=False)
    co2_g_per_km      = Column(Float, nullable=False)
    speed_kmh         = Column(Float, nullable=False)
    driver_chf_h      = Column(Float, nullable=True)
    service_min       = Column(Integer, nullable=True)
    max_per_hub       = Column(Integer, nullable=True)
    restock_threshold = Column(Integer, nullable=True)         # restock if items_loaded < this
    sort_order        = Column(Integer, default=0)             # delivery priority sequence
    enabled           = Column(Boolean, default=True)


class SystemConfig(Base):
    """Key-value store for runtime-configurable system parameters."""
    __tablename__ = "system_config"
    key         = Column(String, primary_key=True)
    value       = Column(String, nullable=False)
    label       = Column(String, nullable=True)
    description = Column(String, nullable=True)
