"""FastAPI auth routes: signup, login, and JWT refresh."""

import asyncio
import os
from datetime import datetime, timedelta
from functools import partial

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

limiter = Limiter(key_func=get_remote_address)

from database import get_db
from models_async import User
from schemas import SignupRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
if not JWT_SECRET:
    raise SystemExit(
        "FATAL: JWT_SECRET environment variable is not set. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
# Access token: 15 minutes (short-lived, stored in memory by frontend)
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))
# Refresh token: 30 days (long-lived, stored in httpOnly cookie)
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))
# Legacy fallback for clients that haven't migrated yet
JWT_EXPIRY_HOURS = 24

_REFRESH_COOKIE = "filegeek_refresh"


def _create_access_token(user: User) -> str:
    payload = {
        "user_id": user.id,
        "email": user.email,
        "type": "access",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _create_refresh_token(user: User) -> str:
    payload = {
        "user_id": user.id,
        "type": "refresh",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _create_token(user: User) -> str:
    """Legacy 24-hour token — kept for backward compatibility with app.py clients."""
    payload = {
        "user_id": user.id,
        "email": user.email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=os.getenv("HTTPS_ONLY", "false").lower() == "true",
        samesite="strict",
        max_age=REFRESH_TOKEN_DAYS * 86400,
        path="/auth/refresh",
    )


@router.post("/signup", status_code=201)
@limiter.limit("5/minute")
async def signup(data: SignupRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    name = data.name.strip()
    email = data.email.strip().lower()
    password = data.password

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    loop = asyncio.get_event_loop()
    salt = await loop.run_in_executor(None, partial(bcrypt.gensalt, rounds=10))
    password_hash = await loop.run_in_executor(
        None, partial(bcrypt.hashpw, password.encode("utf-8"), salt)
    )
    user = User(name=name, email=email, password_hash=password_hash.decode("utf-8"))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = _create_access_token(user)
    refresh_token = _create_refresh_token(user)
    _set_refresh_cookie(response, refresh_token)

    # Also include legacy 24h token for backward compatibility
    legacy_token = _create_token(user)
    return {
        "token": legacy_token,           # legacy — long-lived for older clients
        "access_token": access_token,    # new — short-lived, store in memory
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@router.post("/login")
@limiter.limit("10/minute")
async def login(data: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    password = data.password

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    loop = asyncio.get_event_loop()
    pw_matches = await loop.run_in_executor(
        None, partial(bcrypt.checkpw, password.encode("utf-8"), user.password_hash.encode("utf-8"))
    )
    if not pw_matches:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = _create_access_token(user)
    refresh_token = _create_refresh_token(user)
    _set_refresh_cookie(response, refresh_token)

    legacy_token = _create_token(user)
    return {
        "token": legacy_token,
        "access_token": access_token,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    filegeek_refresh: str = Cookie(default=None),
):
    """Exchange a valid refresh token (httpOnly cookie) for a new access token."""
    if not filegeek_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")

    try:
        payload = jwt.decode(filegeek_refresh, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired — please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token type mismatch")

    result = await db.execute(select(User).where(User.id == payload["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue a new access token (rotate refresh token for forward secrecy)
    new_access = _create_access_token(user)
    new_refresh = _create_refresh_token(user)
    _set_refresh_cookie(response, new_refresh)

    return {"access_token": new_access, "user": {"id": user.id, "name": user.name, "email": user.email}}


@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(key=_REFRESH_COOKIE, path="/auth/refresh")
    return {"message": "Logged out"}
