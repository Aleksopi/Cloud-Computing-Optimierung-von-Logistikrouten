from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, ForeignKey
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


class Hub(Base):
    __tablename__ = "hubs"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    hub_type = Column(String, nullable=False)  # HQ, VZ, mVZ
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    parent_hub = Column(String, nullable=True)  # mVZ → nearest VZ name


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
