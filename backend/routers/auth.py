"""FastAPI auth routes: signup, login, JWT refresh, and password reset."""

import asyncio
import os
import secrets
from datetime import datetime, timedelta
from functools import partial

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

limiter = Limiter(key_func=get_remote_address)

from database import get_db
from models_async import PasswordResetToken, User
from schemas import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
if not JWT_SECRET:
    raise SystemExit(
        "FATAL: JWT_SECRET environment variable is not set. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

# Access token: 60 minutes (short-lived, stored in memory by frontend)
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))
# Refresh token: 30 days (long-lived, stored in httpOnly cookie)
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))

_REFRESH_COOKIE = "filegeek_refresh"


def _is_https() -> bool:
    """Return True when running behind HTTPS (production)."""
    if os.getenv("HTTPS_ONLY", "").lower() == "true":
        return True
    if os.getenv("ENVIRONMENT", "").lower() in ("production", "prod"):
        return True
    return False


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


def _set_refresh_cookie(response: Response, token: str) -> None:
    https = _is_https()
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        # samesite="none" is required for cross-origin (Vercel → Render).
        # "none" requires secure=True, which is only valid over HTTPS.
        # Fall back to "lax" for local HTTP development.
        secure=https,
        samesite="none" if https else "lax",
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

    loop = asyncio.get_running_loop()
    salt = await loop.run_in_executor(None, partial(bcrypt.gensalt, rounds=12))
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

    return {
        "token": access_token,        # kept for backward compat with older frontend builds
        "access_token": access_token,
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

    loop = asyncio.get_running_loop()
    pw_matches = await loop.run_in_executor(
        None, partial(bcrypt.checkpw, password.encode("utf-8"), user.password_hash.encode("utf-8"))
    )
    if not pw_matches:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = _create_access_token(user)
    refresh_token = _create_refresh_token(user)
    _set_refresh_cookie(response, refresh_token)

    return {
        "token": access_token,
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

    # Issue new tokens (rotate refresh token for forward secrecy)
    new_access = _create_access_token(user)
    new_refresh = _create_refresh_token(user)
    _set_refresh_cookie(response, new_refresh)

    return {"access_token": new_access, "user": {"id": user.id, "name": user.name, "email": user.email}}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    data: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Request a password reset token. Always returns success to prevent email enumeration."""
    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    response_data: dict = {
        "message": "If an account exists for that email, a reset link has been generated."
    }

    if user:
        # Invalidate any existing tokens for this user
        await db.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=1),
        ))
        await db.commit()

        # In non-production environments return the token directly so the app
        # works without an email service configured.
        if os.getenv("ENVIRONMENT", "development").lower() not in ("production", "prod"):
            response_data["reset_token"] = token

    return response_data


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    data: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Consume a reset token and update the user's password."""
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == data.token,
            PasswordResetToken.used.is_(False),
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    loop = asyncio.get_running_loop()
    salt = await loop.run_in_executor(None, partial(bcrypt.gensalt, rounds=12))
    password_hash = await loop.run_in_executor(
        None, partial(bcrypt.hashpw, data.new_password.encode("utf-8"), salt)
    )
    user.password_hash = password_hash.decode("utf-8")
    reset_token.used = True
    await db.commit()

    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    https = _is_https()
    response.delete_cookie(
        key=_REFRESH_COOKIE,
        path="/auth/refresh",
        secure=https,
        samesite="none" if https else "lax",
    )
    return {"message": "Logged out"}
