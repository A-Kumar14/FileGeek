"""
Startup environment variable validator.

Runs BEFORE gunicorn starts (via docker-entrypoint.sh).
Exits with code 1 and prints all missing vars if any are absent —
this causes Render to mark the deploy as failed instead of crash-looping.
"""

import os
import sys

# ── Required: must be set or server refuses to start ──────────────────────────
REQUIRED = {
    "JWT_SECRET": (
        "JWT signing secret. "
        'Generate one: python -c "import secrets; print(secrets.token_hex(32))"'
    ),
}

# ── Required one-of: at least one in each group must be set ───────────────────
REQUIRED_ONE_OF = [
    {
        "vars": ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"],
        "hint": "At least one AI provider key is required for chat to work.",
    },
]

# ── Strongly recommended (warn but don't block) ────────────────────────────────
RECOMMENDED = {
    "REDIS_URL": "Redis URL for Celery task queue and Socket.IO. Async indexing will be unavailable without it.",
    "HTTPS_ONLY": 'Set to "true" in production so refresh cookies are sent over HTTPS only.',
}


def _check() -> bool:
    errors: list[str] = []
    warnings: list[str] = []

    # Hard required
    for var, hint in REQUIRED.items():
        if not os.getenv(var):
            errors.append(f"  MISSING  {var}\n           {hint}")

    # One-of groups
    for group in REQUIRED_ONE_OF:
        if not any(os.getenv(v) for v in group["vars"]):
            names = " | ".join(group["vars"])
            errors.append(f"  MISSING  one of: {names}\n           {group['hint']}")

    # Recommended
    for var, hint in RECOMMENDED.items():
        if not os.getenv(var):
            warnings.append(f"  WARN  {var} not set — {hint}")

    # ── Report ─────────────────────────────────────────────────────────────────
    if warnings:
        print("=" * 65)
        print("startup_check: WARNINGS (non-fatal)")
        print("=" * 65)
        for w in warnings:
            print(w)
        print()

    if errors:
        print("=" * 65)
        print("startup_check: FAILED — missing required environment variables")
        print("=" * 65)
        for e in errors:
            print(e)
        print()
        print("Fix: set these in your Render dashboard →")
        print("     Dashboard → your service → Environment → Add Environment Variable")
        print("     Then trigger a manual deploy.")
        print("=" * 65)
        return False

    print("startup_check: OK — all required environment variables are present")
    return True


if __name__ == "__main__":
    if not _check():
        sys.exit(1)
