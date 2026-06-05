import json
import logging
import os

from sqlalchemy import text

from app.config import settings
from app.db.models import Base, Pharmacy, PipelineRun, PopulationCell, VehicleFleetConfig, SystemConfig
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)

# ── Default vehicle fleet ──────────────────────────────────────────────────────
DEFAULT_VEHICLES = [
    dict(name="Sprinter", vehicle_class="delivery", capacity=15, range_km=350.0,
         cost_per_km=0.38, co2_g_per_km=185.0, speed_kmh=65.0, driver_chf_h=45.0,
         service_min=20, max_per_hub=10, restock_threshold=5, sort_order=1, enabled=True),
    dict(name="LKW", vehicle_class="delivery", capacity=200, range_km=500.0,
         cost_per_km=1.20, co2_g_per_km=280.0, speed_kmh=75.0, driver_chf_h=55.0,
         service_min=35, max_per_hub=5, restock_threshold=20, sort_order=2, enabled=True),
    dict(name="Backbone", vehicle_class="backbone", capacity=None, range_km=1000.0,
         cost_per_km=2.50, co2_g_per_km=450.0, speed_kmh=85.0, driver_chf_h=None,
         service_min=None, max_per_hub=None, restock_threshold=None, sort_order=0, enabled=True),
]

# ── Default system configuration ──────────────────────────────────────────────
DEFAULT_SYSTEM_CONFIG = [
    ("population_per_item", "12000",  "Bevölkerung pro Warenartikel",     "Warenbedarf-Berechnung (Step 3)"),
    ("shift_hours",         "8.0",    "Schichtlänge (Stunden)",            "Maximale Fahrzeit pro Schicht"),
    ("opt_weight_cost",     "0.40",   "Optimierungsgewicht: Kosten",       "Anteil Fahrtkosten am Score (0–1)"),
    ("opt_weight_time",     "0.35",   "Optimierungsgewicht: Zeit",         "Anteil Fahrzeit am Score (0–1)"),
    ("opt_weight_env",      "0.25",   "Optimierungsgewicht: Umwelt",       "Anteil CO₂ am Score (0–1)"),
    ("traffic_factor",      "1.0",    "Verkehrsfaktor",                    "1.0 = Freifluss; >1.0 = Stau"),
    ("co2_shadow_chf",      "0.12",   "CO₂-Schattenpreis (CHF/kg)",        "Monetarisierung der Umweltkosten"),
    ("max_catchment_km",    "10.0",   "Max. Einzugsgebiet-Radius (km)",    "Für Warenbedarf-Berechnung"),
    ("vz_hard_radius_km",   "45.0",   "VZ-Zuweisungsradius (km)",          "Apotheke → direkt zu VZ wenn ≤ Radius"),
]


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_columns()
    db = SessionLocal()
    try:
        for step in range(1, 5):
            if not db.query(PipelineRun).filter(PipelineRun.step == step).first():
                db.add(PipelineRun(step=step, status="idle"))
        db.commit()

        if db.query(Pharmacy).count() == 0:
            _import_pharmacies(db)

        if db.query(PopulationCell).count() == 0:
            _import_population(db)

        if db.query(VehicleFleetConfig).count() == 0:
            _seed_vehicles(db)

        if db.query(SystemConfig).count() == 0:
            _seed_system_config(db)
    finally:
        db.close()


def _migrate_columns():
    """Add new columns to existing tables without dropping data (idempotent)."""
    migrations = [
        "ALTER TABLE hubs ADD COLUMN IF NOT EXISTS parent_hub VARCHAR",
        "ALTER TABLE vehicle_routes ADD COLUMN IF NOT EXISTS supply_tier VARCHAR",
        "ALTER TABLE vehicle_routes ADD COLUMN IF NOT EXISTS co2_kg DOUBLE PRECISION",
    ]
    try:
        for sql in migrations:
            with engine.begin() as conn:
                conn.execute(text(sql))
        logger.info("[init_db] Column migrations applied")
    except Exception as e:
        logger.warning(f"[init_db] Migration warning (non-fatal): {e}")


def _seed_vehicles(db):
    for v in DEFAULT_VEHICLES:
        db.add(VehicleFleetConfig(**v))
    db.commit()
    logger.info(f"[init_db] Seeded {len(DEFAULT_VEHICLES)} vehicle configs")


def _seed_system_config(db):
    for key, value, label, description in DEFAULT_SYSTEM_CONFIG:
        db.add(SystemConfig(key=key, value=value, label=label, description=description))
    db.commit()
    logger.info(f"[init_db] Seeded {len(DEFAULT_SYSTEM_CONFIG)} system config entries")


def _import_pharmacies(db):
    path = os.path.join(settings.data_dir, "apotheken.geojson")
    if not os.path.exists(path):
        logger.warning("apotheken.geojson not found, downloading from Overpass API...")
        from app.services.downloader import download_pharmacies
        download_pharmacies(path)

    with open(path) as f:
        data = json.load(f)

    pharmacies = []
    for feat in data["features"]:
        props = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        pharmacies.append(
            Pharmacy(
                osm_id=str(props.get("@id", "")),
                name=props.get("name", ""),
                city=props.get("addr:city", ""),
                lon=float(coords[0]),
                lat=float(coords[1]),
            )
        )
    db.bulk_save_objects(pharmacies)
    db.commit()
    logger.info(f"Imported {len(pharmacies)} pharmacies")


def _import_population(db):
    path = os.path.join(settings.data_dir, "population.geojson")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"population.geojson not found at {path}. "
            "Please place workspace/data/estat_switzerland.geojson as backend/data/population.geojson"
        )

    logger.info("Importing population cells (this may take a moment)...")
    with open(path) as f:
        data = json.load(f)

    cells = []
    for feat in data["features"]:
        props = feat["properties"]
        pop = int(props.get("pop_total", 0) or 0)
        if pop <= 0:
            continue
        lat = props.get("latitude")
        lon = props.get("longitude")
        if lat is None or lon is None:
            coords = feat["geometry"]["coordinates"]
            if feat["geometry"]["type"] == "Point":
                lon, lat = coords[0], coords[1]
            else:
                continue
        cells.append(PopulationCell(lat=float(lat), lon=float(lon), population=pop))

    for i in range(0, len(cells), 5000):
        db.bulk_save_objects(cells[i : i + 5000])
        db.commit()

    logger.info(f"Imported {len(cells)} population cells")
