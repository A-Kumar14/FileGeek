"""
utils/cache.py — Lazy Redis client and ETag helpers.
"""

import hashlib
import json

from fastapi import Request

from config import Config

_redis_client = None


def get_redis():
    """Return a Redis client if available, else None (graceful fallback)."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis as _redis_lib
        r = _redis_lib.from_url(Config.REDIS_URL, socket_connect_timeout=1, decode_responses=True)
        r.ping()
        _redis_client = r
        return r
    except Exception:
        return None


def make_etag(data: dict | list) -> str:
    """Compute a quoted MD5 ETag from JSON-serialisable data."""
    digest = hashlib.md5(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()
    return f'"{digest}"'


def check_etag(request: Request, etag: str) -> bool:
    """Return True when the client's If-None-Match matches the ETag (304 path)."""
    return request.headers.get("if-none-match") == etag
