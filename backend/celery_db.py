"""Synchronous SQLAlchemy session for Celery workers (no async context needed)."""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _normalize_sync_url(url: str) -> str:
    """
    Render's free PostgreSQL gives a plain  postgresql://  URL.
    SQLAlchemy sync engine needs  postgresql+psycopg2://  for the psycopg2 driver.
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


SYNC_DATABASE_URL = _normalize_sync_url(
    os.getenv("SYNC_DATABASE_URL", os.getenv("DATABASE_URL", "sqlite:///./instance/users.db"))
)

_is_sqlite = SYNC_DATABASE_URL.startswith("sqlite")

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    # check_same_thread is a SQLite-only option; must not be passed to psycopg2
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

SyncSession = sessionmaker(bind=sync_engine, expire_on_commit=False)
