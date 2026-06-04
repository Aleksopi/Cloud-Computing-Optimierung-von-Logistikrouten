import logging
import traceback
from datetime import datetime

from app.celery_app import celery_app
from app.db.models import Hub, Pharmacy, PipelineRun
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


def _set_status(step: int, status: str, error: str | None = None) -> None:
    db = SessionLocal()
    try:
        run = db.query(PipelineRun).filter(PipelineRun.step == step).first()
        run.status = status
        if status in ("done", "error"):
            run.finished_at = datetime.utcnow()
        if error:
            run.error_message = error[:4000]
        db.commit()
    finally:
        db.close()


@celery_app.task(name="run_step_1")
def run_step_1() -> None:
    logger.info("=== Step 1: Hub Placement ===")
    try:
        from app.pipeline.a1_hub_placement import run_hub_placement

        db = SessionLocal()
        try:
            pharmacies = db.query(Pharmacy).all()
            run_hub_placement(pharmacies, db)
        finally:
            db.close()
        _set_status(1, "done")
    except Exception:
        _set_status(1, "error", traceback.format_exc())
        raise


@celery_app.task(name="run_step_2")
def run_step_2() -> None:
    logger.info("=== Step 2: Influence / Road Assignment ===")
    try:
        from app.pipeline.a2_influence import run_influence

        db = SessionLocal()
        try:
            pharmacies = db.query(Pharmacy).all()
            hubs = db.query(Hub).filter(Hub.hub_type != "HQ").all()
            run_influence(pharmacies, hubs, db)
        finally:
            db.close()
        _set_status(2, "done")
    except Exception:
        _set_status(2, "error", traceback.format_exc())
        raise


@celery_app.task(name="run_step_3")
def run_step_3() -> None:
    logger.info("=== Step 3: Demand Calculation ===")
    try:
        from app.pipeline.a3_demand import run_demand

        db = SessionLocal()
        try:
            run_demand(db)
        finally:
            db.close()
        _set_status(3, "done")
    except Exception:
        _set_status(3, "error", traceback.format_exc())
        raise


@celery_app.task(name="run_step_4")
def run_step_4() -> None:
    logger.info("=== Step 4: Route Optimisation ===")
    try:
        from app.pipeline.a4_routes import run_routes

        db = SessionLocal()
        try:
            run_routes(db)
        finally:
            db.close()
        _set_status(4, "done")
    except Exception:
        _set_status(4, "error", traceback.format_exc())
        raise
