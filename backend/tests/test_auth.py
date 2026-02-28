"""FastAPI auth endpoint tests using pytest + httpx AsyncClient."""

import pytest

pytestmark = pytest.mark.asyncio


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _signup(client, email="test@example.com", password="Password123!", name="Test User"):
    return await client.post("/auth/signup", json={"name": name, "email": email, "password": password})


async def _login(client, email="test@example.com", password="Password123!"):
    return await client.post("/auth/login", json={"email": email, "password": password})


# ── /health ───────────────────────────────────────────────────────────────────

async def test_health_returns_ok(client):
    res = await client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "version" in data


# ── POST /auth/signup ─────────────────────────────────────────────────────────

async def test_signup_success(client):
    res = await _signup(client)
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"


async def test_signup_duplicate_email(client):
    await _signup(client)
    res = await _signup(client)  # same email
    assert res.status_code == 409


# ── POST /auth/login ──────────────────────────────────────────────────────────

async def test_login_success(client):
    await _signup(client)
    res = await _login(client)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"


async def test_login_wrong_password(client):
    await _signup(client)
    res = await _login(client, password="WrongPassword!")
    assert res.status_code == 401


async def test_login_unknown_email(client):
    res = await _login(client, email="nobody@example.com")
    assert res.status_code == 401


# ── GET /sessions (auth guard) ────────────────────────────────────────────────

async def test_sessions_requires_auth(client):
    res = await client.get("/sessions")
    assert res.status_code == 401
