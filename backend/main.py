"""FileGeek FastAPI application — app setup, middleware, and router registration."""

import os
import sqlite3
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.exc import DatabaseError as SADatabaseError

from config import Config
from database import init_db, AsyncSessionLocal
from logging_config import get_logger
from socket_manager import socket_app

logger = get_logger(__name__)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Rate limiter ────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("database.initialized")
    if os.getenv("LEGACY_ENDPOINTS", "false").lower() == "true":
        logger.warning("legacy_endpoints.enabled — /upload and /ask are active; set LEGACY_ENDPOINTS=false to retire them")
    yield


# ── App ─────────────────────────────────────────────────────────────────────────
app = FastAPI(title="FileGeek API", version="5.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Exception handlers — DB corruption + catch-all ─────────────────────────────
@app.exception_handler(sqlite3.DatabaseError)
async def sqlite_db_error_handler(request: Request, exc: sqlite3.DatabaseError):
    logger.critical("sqlite.DatabaseError path=%s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"error": "System maintenance in progress. Please try again shortly.", "code": "DB_MAINTENANCE"},
    )


@app.exception_handler(SADatabaseError)
async def sqlalchemy_db_error_handler(request: Request, exc: SADatabaseError):
    logger.critical("sqlalchemy.DatabaseError path=%s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"error": "System maintenance in progress. Please try again shortly.", "code": "DB_MAINTENANCE"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    err_lower = str(exc).lower()
    _db_keywords = ("disk image is malformed", "database is locked", "no such table",
                    "malformed", "database disk image")
    if any(k in err_lower for k in _db_keywords):
        logger.critical("db.corruption path=%s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"error": "System maintenance in progress. Please try again shortly.", "code": "DB_MAINTENANCE"},
        )
    logger.error("unhandled_exception path=%s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected server error occurred. Please try again."},
    )


# ── CORS ────────────────────────────────────────────────────────────────────────
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://filegeek.vercel.app",
        *_extra_origins,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "5.0.0"}


# ── Routers ─────────────────────────────────────────────────────────────────────
from routers.auth import router as auth_router
from routers.admin import router as admin_router
from routers.sessions import router as sessions_router
from routers.documents import router as documents_router
from routers.chat import router as chat_router
from routers.study import router as study_router
from routers.media import router as media_router
from routers.export import router as export_router
from routers.explore import router as explore_router
from routers.legacy import router as legacy_router

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(sessions_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(study_router)
app.include_router(media_router)
app.include_router(export_router)
app.include_router(explore_router)
app.include_router(legacy_router)


# ── Static uploads + Socket.IO ──────────────────────────────────────────────────
app.mount("/socket.io", socket_app)
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_FOLDER), name="uploads")


# ── Request logging middleware ───────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(
        "request.received",
        ip=request.client.host if request.client else "unknown",
        method=request.method,
        path=request.url.path,
    )
    return await call_next(request)


# ── Entrypoint ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    logger.info("Starting FileGeek FastAPI server on port %s...", Config.PORT)
    uvicorn.run("main:app", host=Config.HOST, port=Config.PORT, reload=False)
