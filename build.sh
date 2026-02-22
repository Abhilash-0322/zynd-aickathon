#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# build.sh — Production build script for monolithic deployment
# Builds the Next.js frontend then starts the FastAPI backend.
# The backend serves the static Next.js output from web/out/.
#
# Usage:
#   ./build.sh          → build + start
#   BUILD_ONLY=1 ./build.sh   → build only (for CI/CD platforms)
# ────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "════════════════════════════════════════"
echo "  Zynd Protocol — Production Build"
echo "════════════════════════════════════════"

# ── 1. Python dependencies ───────────────────────────────────────────────────
echo ""
echo "▶  Installing Python dependencies..."
pip install -r requirements.txt --quiet

# ── 2. Node.js / Next.js frontend ────────────────────────────────────────────
echo ""
echo "▶  Installing Node.js dependencies..."
cd web
npm ci --silent

echo ""
echo "▶  Building Next.js static export  (output → web/out/)..."
# NEXT_PUBLIC_API_URL="" means same-origin → all API calls are relative
NEXT_PUBLIC_API_URL="" npm run build

cd "$SCRIPT_DIR"

echo ""
echo "▶  Frontend build complete. Static files in: web/out/"

# ── 3. Start server (unless BUILD_ONLY is set) ────────────────────────────────
if [ "${BUILD_ONLY:-0}" = "1" ]; then
    echo ""
    echo "✓  BUILD_ONLY mode — skipping server start."
    exit 0
fi

echo ""
echo "▶  Starting FastAPI server..."
PORT="${PORT:-8000}"
exec python -m uvicorn centralized.server:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level info
