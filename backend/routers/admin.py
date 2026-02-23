"""
routers/admin.py — Health check, Celery worker status, and task polling endpoints.
"""

import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from config import Config
from dependencies import CurrentUser, DB
from logging_config import get_logger
from services.registry import rag_service

logger = get_logger(__name__)

router = APIRouter(tags=["admin"])

_celery_available = False
celery_app = None

try:
    from celery_app import celery_app  # noqa: F811
    _celery_available = True
    logger.info("celery.initialized")
except Exception as exc:
    logger.warning("celery.unavailable", error=str(exc))


@router.get("/health")
async def health_check():
    chroma_ok = False
    try:
        rag_service.collection.count()
        chroma_ok = True
    except Exception as exc:
        logger.warning("health.chromadb.down", error=str(exc))

    redis_ok = False
    try:
        import redis as _redis
        r = _redis.from_url(Config.REDIS_URL or "redis://localhost:6379")
        r.ping()
        redis_ok = True
    except Exception as exc:
        logger.warning("health.redis.down", error=str(exc))

    embedding_check = rag_service.check_embedding_dimensions()
    overall = "healthy" if chroma_ok else "degraded"
    if embedding_check.get("status") == "mismatch":
        overall = "degraded"

    return {
        "status": overall,
        "timestamp": datetime.now().isoformat(),
        "version": "5.0.0",
        "celery_available": _celery_available,
        "chromadb": "ok" if chroma_ok else "unavailable",
        "redis": "ok" if redis_ok else "unavailable",
        "embeddings": embedding_check,
    }


@router.get("/workers/status")
async def workers_status():
    """Report Celery worker availability so the UI can warn users."""
    if not _celery_available:
        return {"available": False, "workers": [], "reason": "Celery not configured"}
    try:
        i = celery_app.control.inspect(timeout=2.0)
        active = i.active() or {}
        worker_names = list(active.keys())
        return {
            "available": len(worker_names) > 0,
            "workers": worker_names,
            "worker_count": len(worker_names),
        }
    except Exception as exc:
        logger.warning("workers.inspect.failed", error=str(exc))
        return {"available": False, "workers": [], "reason": str(exc)}


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str, request: Request, current_user: CurrentUser, db: DB):
    if not _celery_available:
        raise HTTPException(status_code=503, detail="Async tasks not available")

    from celery.result import AsyncResult
    result = AsyncResult(task_id, app=celery_app)
    state = result.state
    meta = result.info if isinstance(result.info, dict) else {}

    progress_map = {
        "PENDING": 5, "DOWNLOADING": 20, "EXTRACTING": 50,
        "INDEXING": 80, "SUCCESS": 100, "FAILURE": 0,
    }

    resp = {
        "task_id": task_id,
        "status": state,
        "phase": meta.get("phase", state.lower()),
        "progress": progress_map.get(state, 50),
    }
    if state == "SUCCESS":
        resp["result"] = result.result
        resp["progress"] = 100
    elif state == "FAILURE":
        resp["error"] = str(result.info)
        resp["progress"] = 0

    return resp
