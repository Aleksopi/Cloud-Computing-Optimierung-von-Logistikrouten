from fastapi import APIRouter
from app.db.session import engine
from sqlalchemy import text

router = APIRouter()


@router.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": "ok" if db_ok else "error"}
