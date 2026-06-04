import json
import logging
import os

from app.config import settings
from app.db.models import Base, Pharmacy, PipelineRun, PopulationCell
from app.db.session import SessionLocal, engine

logger = logging.getLogger(__name__)


def init_db():
    Base.metadata.create_all(bind=engine)
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
    finally:
        db.close()


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
                # Polygon: use provided centroid or bbox center
                continue
        cells.append(PopulationCell(lat=float(lat), lon=float(lon), population=pop))

    for i in range(0, len(cells), 5000):
        db.bulk_save_objects(cells[i : i + 5000])
        db.commit()

    logger.info(f"Imported {len(cells)} population cells")
