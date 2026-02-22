#!/usr/bin/env bash
# ─── Zynd Protocol — Full Stack Startup ────────────────────────────────────
# Starts: PostgreSQL check → Backend (centralized) → Next.js Frontend
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║    TalentInfra — fair hiring powered by Zynd     ║"
echo "║    Starting Full Stack...                        ║"
echo "╚══════════════════════════════════════════════════╝"

# ── Check PostgreSQL ──
echo "→ Checking PostgreSQL..."
if pg_isready -q 2>/dev/null; then
    echo "  ✓ PostgreSQL is running"
else
    echo "  ✗ PostgreSQL is not running. Starting..."
    sudo systemctl start postgresql 2>/dev/null || echo "  ⚠ Could not start PostgreSQL automatically"
fi

# ── Activate Python venv ──
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "  ✓ Python venv activated"
fi

# ── Initialize database ──
echo "→ Initializing database..."
python -c "from api_server.database import init_db; init_db()" 2>/dev/null && echo "  ✓ Database tables ready" || echo "  ⚠ DB init skipped"

# ── Start Backend ──
echo "→ Starting centralized backend on port 8000..."
python -m centralized.server &
BACKEND_PID=$!
echo "  ✓ Backend PID: $BACKEND_PID"
echo "$BACKEND_PID" > logs/backend.pid

# Wait for backend to be ready
echo "  Waiting for backend..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "  ✓ Backend is ready!"
        break
    fi
    sleep 1
done

# ── Start Next.js Frontend ──
echo "→ Starting Next.js frontend on port 3000..."
cd web
npm run dev -- -p 3000 &
FRONTEND_PID=$!
echo "  ✓ Frontend PID: $FRONTEND_PID"
cd ..
echo "$FRONTEND_PID" > logs/frontend.pid

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  🚀 Zynd Protocol is running!                   ║"
echo "║                                                  ║"
echo "║  Frontend:  http://localhost:3000                 ║"
echo "║  Backend:   http://localhost:8000                 ║"
echo "║  API Docs:  http://localhost:8000/docs            ║"
echo "║                                                  ║"
echo "║  Press Ctrl+C to stop all services               ║"
echo "╚══════════════════════════════════════════════════╝"

# Trap Ctrl+C to kill both processes
trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
