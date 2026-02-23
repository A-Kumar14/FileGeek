#!/bin/bash
# scripts/predeploy.sh
#
# Run this before pushing to main to catch missing env vars before Render does.
#
# Usage:
#   chmod +x scripts/predeploy.sh   (first time only)
#   ./scripts/predeploy.sh
#
# It checks your local backend/.env file against the required vars defined in
# backend/startup_check.py. Exits with code 1 if anything is missing.

set -e

BOLD="\033[1m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
GREEN="\033[0;32m"
RESET="\033[0m"

ENV_FILE="$(dirname "$0")/../backend/.env"
EXAMPLE_FILE="$(dirname "$0")/../backend/.env.example"

echo ""
echo "${BOLD}FileGeek Pre-Deploy Check${RESET}"
echo "──────────────────────────────────────────────"

# ── 1. Check .env file exists ─────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "${YELLOW}  WARN  backend/.env not found — checking shell environment instead.${RESET}"
    echo "         (If deploying to Render, vars must be set in the Render dashboard.)"
    echo ""
    USE_SHELL=true
else
    USE_SHELL=false
    # Load .env into current shell (without exporting to subprocesses)
    set -a
    source "$ENV_FILE"
    set +a
    echo "  Loaded backend/.env"
fi

ERRORS=0
WARNINGS=0

# ── 2. Hard required vars ─────────────────────────────────────────────────────
REQUIRED_VARS=("JWT_SECRET")

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "${RED}  ✗ MISSING   ${var}${RESET}"
        ERRORS=$((ERRORS + 1))
    else
        echo "${GREEN}  ✓ OK        ${var}${RESET}"
    fi
done

# ── 3. At least one AI provider ───────────────────────────────────────────────
AI_VARS=("OPENROUTER_API_KEY" "OPENAI_API_KEY" "GOOGLE_API_KEY")
AI_FOUND=false
for var in "${AI_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo "${GREEN}  ✓ OK        ${var} (AI provider)${RESET}"
        AI_FOUND=true
    fi
done
if [ "$AI_FOUND" = false ]; then
    echo "${RED}  ✗ MISSING   at least one of: OPENROUTER_API_KEY | OPENAI_API_KEY | GOOGLE_API_KEY${RESET}"
    ERRORS=$((ERRORS + 1))
fi

# ── 4. Strongly recommended ───────────────────────────────────────────────────
RECOMMENDED_VARS=("REDIS_URL" "HTTPS_ONLY")
for var in "${RECOMMENDED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "${YELLOW}  ! MISSING   ${var} (recommended for production)${RESET}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "${GREEN}  ✓ OK        ${var}${RESET}"
    fi
done

# ── 5. Check .gitignore has .env ──────────────────────────────────────────────
GITIGNORE="$(dirname "$0")/../.gitignore"
if ! grep -qE "^\.env$|^backend/\.env$|/\.env" "$GITIGNORE" 2>/dev/null; then
    echo "${RED}  ✗ DANGER    .env is NOT in .gitignore — do not commit secrets!${RESET}"
    ERRORS=$((ERRORS + 1))
else
    echo "${GREEN}  ✓ OK        .env is in .gitignore${RESET}"
fi

# ── 6. Check .env.example is up to date ───────────────────────────────────────
if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "${YELLOW}  ! MISSING   backend/.env.example — create it so teammates know what vars to set.${RESET}"
    WARNINGS=$((WARNINGS + 1))
else
    echo "${GREEN}  ✓ OK        backend/.env.example exists${RESET}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────"
if [ $ERRORS -gt 0 ]; then
    echo "${RED}${BOLD}  FAILED — $ERRORS error(s), $WARNINGS warning(s)${RESET}"
    echo ""
    echo "  Fix the errors above before pushing."
    echo "  Set them in backend/.env locally and in the Render dashboard for production."
    echo ""
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "${YELLOW}${BOLD}  PASSED with $WARNINGS warning(s) — safe to push, but review warnings above.${RESET}"
    echo ""
else
    echo "${GREEN}${BOLD}  ALL CHECKS PASSED — safe to push.${RESET}"
    echo ""
fi
