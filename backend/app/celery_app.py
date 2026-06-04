from celery import Celery
from app.config import settings

celery_app = Celery(
    "pharma_logistics",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.pipeline.runner"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
