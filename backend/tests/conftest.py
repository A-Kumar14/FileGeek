"""pytest configuration — sets required env vars before any app module is imported."""

import os

# Must be set before importing main/routers/auth (raises SystemExit if missing)
os.environ.setdefault("JWT_SECRET", "test-only-secret-do-not-use-in-prod")
# In-memory SQLite for tests — avoids touching the real DB file
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ.setdefault("SYNC_DATABASE_URL", "sqlite:///:memory:")

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """Return an AsyncClient wired to the FastAPI app with a fresh in-memory DB."""
    # Import here so env vars are already set
    from main import app
    from database import engine
    from models_async import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
