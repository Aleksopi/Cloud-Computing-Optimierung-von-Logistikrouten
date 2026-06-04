from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.db.models import Assignment, Hub, Pharmacy, PipelineRun, VehicleRoute
from app.db.session import SessionLocal

router = APIRouter()

_STEP_TASKS = {}  # populated lazily to avoid circular import at module load


def _get_task(step: int):
    if not _STEP_TASKS:
        from app.pipeline.runner import run_step_1, run_step_2, run_step_3, run_step_4
        _STEP_TASKS.update({1: run_step_1, 2: run_step_2, 3: run_step_3, 4: run_step_4})
    return _STEP_TASKS[step]


@router.post("/run/{step}")
def run_step(step: int):
    if step not in (1, 2, 3, 4):
        raise HTTPException(400, "Step must be 1–4")

    db = SessionLocal()
    try:
        run = db.query(PipelineRun).filter(PipelineRun.step == step).first()
        if run.status == "running":
            raise HTTPException(409, f"Step {step} is already running")

        if step > 1:
            prev = db.query(PipelineRun).filter(PipelineRun.step == step - 1).first()
            if prev.status != "done":
                raise HTTPException(400, f"Step {step - 1} must finish before step {step}")

        run.status = "running"
        run.started_at = datetime.utcnow()
        run.finished_at = None
        run.error_message = None
        db.commit()
    finally:
        db.close()

    _get_task(step).delay()
    return {"message": f"Step {step} started"}


@router.get("/status")
def get_status():
    db = SessionLocal()
    try:
        runs = db.query(PipelineRun).order_by(PipelineRun.step).all()
        return {
            r.step: {
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "error_message": r.error_message,
            }
            for r in runs
        }
    finally:
        db.close()


@router.post("/reset")
def reset_pipeline():
    db = SessionLocal()
    try:
        db.query(VehicleRoute).delete()
        db.query(Assignment).delete()
        db.query(Hub).delete()
        db.query(Pharmacy).update({"hub_name": None, "demand": None})
        db.query(PipelineRun).update(
            {"status": "idle", "started_at": None, "finished_at": None, "error_message": None}
        )
        db.commit()
    finally:
        db.close()
    return {"message": "Pipeline reset"}
