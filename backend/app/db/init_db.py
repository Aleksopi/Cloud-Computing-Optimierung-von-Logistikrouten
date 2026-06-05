import json
import logging
import os

from sqlalchemy import text

from app.config import settings
from app.db.models import Base, Pharmacy, PipelineRun, PopulationCell, VehicleFleetConfig, SystemConfig
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)

# ── Default vehicle fleet ──────────────────────────────────────────────────────
# can_last_mile  → usable for Hub → Apotheke delivery
# can_backbone   → usable for HQ → Hub and VZ → mVZ replenishment
DEFAULT_VEHICLES = [
    dict(name="Sprinter",  vehicle_class="delivery", can_last_mile=True,  can_backbone=True,
         capacity=15,   range_km=350.0,  cost_per_km=0.38, co2_g_per_km=185.0, speed_kmh=65.0,
         driver_chf_h=45.0, service_min=20, max_per_hub=10, restock_threshold=5,  sort_order=1, enabled=True),
    dict(name="Klein-LKW", vehicle_class="delivery", can_last_mile=True,  can_backbone=True,
         capacity=40,   range_km=450.0,  cost_per_km=0.70, co2_g_per_km=230.0, speed_kmh=70.0,
         driver_chf_h=50.0, service_min=25, max_per_hub=6,  restock_threshold=10, sort_order=2, enabled=True),
    dict(name="LKW",       vehicle_class="backbone", can_last_mile=False, can_backbone=True,
         capacity=200,  range_km=600.0,  cost_per_km=1.20, co2_g_per_km=280.0, speed_kmh=75.0,
         driver_chf_h=55.0, service_min=35, max_per_hub=5,  restock_threshold=30, sort_order=3, enabled=True),
    dict(name="Zug",       vehicle_class="backbone", can_last_mile=False, can_backbone=True,
         capacity=1000, range_km=2000.0, cost_per_km=3.20, co2_g_per_km=520.0, speed_kmh=90.0,
         driver_chf_h=70.0, service_min=45, max_per_hub=3,  restock_threshold=100, sort_order=4, enabled=True),
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
    ("vz_capacity",         "320",    "VZ-Lagerkapazität (Einheiten)",     "Max. Warenmenge je Verteilzentrum"),
    ("mvz_capacity",        "90",     "mVZ-Lagerkapazität (Einheiten)",    "Max. Warenmenge je Mini-Verteilzentrum"),
    ("default_demand_est",  "3",      "Bedarfsschätzung pro Apotheke",     "Proxy für Kapazitätsprüfung vor Step 3"),
    # Öffnungszeiten (Stunden, z.B. 8.5 = 08:30)
    ("shift_start",         "8.0",    "Schichtbeginn (Stunden)",           "Startzeit der Lieferschicht"),
    ("pharmacy_open_hour",  "8.0",    "Apotheke Öffnung (Stunden)",        "Standard-Öffnungszeit für alle Apotheken"),
    ("pharmacy_close_hour", "18.5",   "Apotheke Schluss (Stunden)",        "Standard-Schließzeit für alle Apotheken"),
    ("hub_hq_open",         "6.0",    "HQ Öffnung (Stunden)",              "Öffnungszeit Hauptquartier"),
    ("hub_hq_close",        "22.0",   "HQ Schluss (Stunden)",              "Schließzeit Hauptquartier"),
    ("hub_vz_open",         "7.0",    "VZ Öffnung (Stunden)",              "Öffnungszeit Verteilzentrum"),
    ("hub_vz_close",        "20.0",   "VZ Schluss (Stunden)",              "Schließzeit Verteilzentrum"),
    ("hub_mvz_open",        "8.0",    "mVZ Öffnung (Stunden)",             "Öffnungszeit Mini-Verteilzentrum"),
    ("hub_mvz_close",       "18.0",   "mVZ Schluss (Stunden)",             "Schließzeit Mini-Verteilzentrum"),
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

        _ensure_vehicles(db)
        _ensure_system_config(db)
        _apply_default_pharmacy_hours(db)
    finally:
        db.close()


def _migrate_columns():
    """Add new columns to existing tables without dropping data (idempotent)."""
    migrations = [
        "ALTER TABLE hubs ADD COLUMN IF NOT EXISTS parent_hub VARCHAR",
        "ALTER TABLE hubs ADD COLUMN IF NOT EXISTS capacity INTEGER",
        "ALTER TABLE hubs ADD COLUMN IF NOT EXISTS open_hour DOUBLE PRECISION",
        "ALTER TABLE hubs ADD COLUMN IF NOT EXISTS close_hour DOUBLE PRECISION",
        "ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS open_hour DOUBLE PRECISION",
        "ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS close_hour DOUBLE PRECISION",
        "ALTER TABLE vehicle_routes ADD COLUMN IF NOT EXISTS supply_tier VARCHAR",
        "ALTER TABLE vehicle_routes ADD COLUMN IF NOT EXISTS co2_kg DOUBLE PRECISION",
        "ALTER TABLE vehicle_fleet_configs ADD COLUMN IF NOT EXISTS can_last_mile BOOLEAN DEFAULT FALSE",
        "ALTER TABLE vehicle_fleet_configs ADD COLUMN IF NOT EXISTS can_backbone BOOLEAN DEFAULT FALSE",
    ]
    try:
        for sql in migrations:
            with engine.begin() as conn:
                conn.execute(text(sql))
        logger.info("[init_db] Column migrations applied")
    except Exception as e:
        logger.warning(f"[init_db] Migration warning (non-fatal): {e}")


def _apply_default_pharmacy_hours(db):
    """Set default opening hours on pharmacies that don't have any yet (idempotent)."""
    sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
    ph_open  = float(sys_raw.get("pharmacy_open_hour",  "8.0"))
    ph_close = float(sys_raw.get("pharmacy_close_hour", "18.5"))
    rows = db.query(Pharmacy).filter(Pharmacy.open_hour == None).all()  # noqa: E711
    for p in rows:
        p.open_hour  = ph_open
        p.close_hour = ph_close
    if rows:
        db.commit()
        logger.info(f"[init_db] Applied default opening hours to {len(rows)} pharmacies")


def _ensure_vehicles(db):
    """Seed the canonical fleet. If the new vehicle line-up (Klein-LKW, Zug) is
    missing, the fleet predates the tier model → wipe and reseed cleanly."""
    existing = db.query(VehicleFleetConfig).all()
    names = {v.name for v in existing}
    needs_reseed = not existing or "Klein-LKW" not in names or "Zug" not in names
    if needs_reseed:
        db.query(VehicleFleetConfig).delete()
        db.commit()
        for v in DEFAULT_VEHICLES:
            db.add(VehicleFleetConfig(**v))
        db.commit()
        logger.info(f"[init_db] Fleet (re)seeded — {len(DEFAULT_VEHICLES)} vehicles")


def _ensure_system_config(db):
    """Insert any missing config keys without overwriting user-edited values."""
    existing = {c.key for c in db.query(SystemConfig).all()}
    added = 0
    for key, value, label, description in DEFAULT_SYSTEM_CONFIG:
        if key not in existing:
            db.add(SystemConfig(key=key, value=value, label=label, description=description))
            added += 1
    if added:
        db.commit()
        logger.info(f"[init_db] Added {added} system config entries")


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
