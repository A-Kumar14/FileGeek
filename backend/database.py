"""Async SQLAlchemy engine and session factory for FastAPI."""

import os
import shutil
import sqlite3
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./instance/users.db",
)


class Base(DeclarativeBase):
    pass


def _get_sqlite_path() -> str | None:
    """Return the filesystem path for the SQLite file, or None for non-SQLite URLs."""
    if not DATABASE_URL.startswith("sqlite"):
        return None
    path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    if path.startswith("./"):
        path = os.path.join(os.path.dirname(__file__), path[2:])
    return os.path.abspath(path)


def _is_db_healthy(db_path: str) -> bool:
    """Quick sync integrity check using the stdlib sqlite3 driver."""
    try:
        con = sqlite3.connect(db_path, timeout=3)
        result = con.execute("PRAGMA integrity_check;").fetchone()
        con.close()
        return result and result[0] == "ok"
    except Exception:
        return False


def _recover_or_reset(db_path: str) -> None:
    """
    Try to recover a malformed SQLite database using .recover, then fall back
    to a clean delete so SQLAlchemy can recreate the schema from scratch.
    A timestamped backup of the corrupted file is always kept beside it.
    """
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.corrupted_{ts}"
    shutil.copy2(db_path, backup_path)
    logger.warning("database.corrupted — backup saved to %s", backup_path)

    recovered_path = f"{db_path}.recovered_{ts}"
    try:
        # sqlite3 .recover extracts as many rows as possible page-by-page
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(recovered_path)
        for line in src.iterdump():        # type: ignore[attr-defined]
            try:
                dst.execute(line)
            except Exception:
                pass  # skip unrecoverable rows
        dst.commit()
        src.close()
        dst.close()

        # Verify the recovered DB is healthy before using it
        if _is_db_healthy(recovered_path):
            os.replace(recovered_path, db_path)
            logger.info("database.recovered — restored from page-level recovery")
            return
        os.remove(recovered_path)
    except Exception as exc:
        logger.warning("database.recovery_failed: %s — will recreate from scratch", exc)
        try:
            os.remove(recovered_path)
        except Exception:
            pass

    # Last resort: remove the corrupted file; SQLAlchemy will recreate the schema
    os.remove(db_path)
    logger.warning("database.reset — corrupted file removed; fresh schema will be created")


def _ensure_healthy_db() -> None:
    """
    Called once at startup (sync).  If the SQLite file exists and fails an
    integrity check, attempt recovery before the async engine touches it.

    Stale WAL/SHM files are the most common cause of "disk image is malformed"
    errors on restart after a hard kill.  We attempt a WAL checkpoint (which
    flushes WAL frames back into the main file) before running integrity_check.
    If that fails we fall back to the full _recover_or_reset path.
    """
    db_path = _get_sqlite_path()
    if not db_path or not os.path.exists(db_path):
        return  # nothing to check; engine will create it

    # Step 1: attempt WAL checkpoint to recover any uncommitted WAL frames
    wal_path = db_path + "-wal"
    shm_path = db_path + "-shm"
    if os.path.exists(wal_path):
        try:
            con = sqlite3.connect(db_path, timeout=5)
            con.execute("PRAGMA wal_checkpoint(FULL)")
            con.close()
            logger.info("database.wal_checkpoint.ok")
        except Exception as wal_exc:
            logger.warning("database.wal_checkpoint.failed: %s", wal_exc)
            # Remove stale WAL/SHM so they don't corrupt the integrity check
            for stale in (wal_path, shm_path):
                try:
                    if os.path.exists(stale):
                        os.remove(stale)
                        logger.warning("database.stale_wal_removed: %s", stale)
                except Exception:
                    pass

    # Step 2: integrity check; recover if corrupted
    if not _is_db_healthy(db_path):
        logger.error("database.disk_image_malformed — attempting recovery")
        _recover_or_reset(db_path)


# Run the health check synchronously before the engine is created so that
# a corrupt file never reaches the async driver.
_ensure_healthy_db()

engine = create_async_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables and enable WAL mode for SQLite."""
    async with engine.begin() as conn:
        if DATABASE_URL.startswith("sqlite"):
            try:
                await conn.execute(text("PRAGMA journal_mode=WAL"))
            except Exception as wal_exc:
                # WAL switch failing at startup must never crash the server —
                # the database is still fully usable in the default rollback-journal mode.
                logger.warning("database.wal_mode.failed (non-fatal): %s", wal_exc)
        from models_async import Base as ModelsBase  # noqa: F401
        await conn.run_sync(ModelsBase.metadata.create_all)
