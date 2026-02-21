#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fair Hiring Network — Centralized Start Script
# Runs the ENTIRE system (all 6 agents + API server) in ONE process.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

VENV_PYTHON="${DIR}/.venv/bin/python"
PYTHON="${VENV_PYTHON:-python3}"
LOG_DIR="${DIR}/logs"
PORT="${CENTRAL_PORT:-8000}"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[ OK ]\033[0m  $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
die()   { echo -e "\033[1;31m[FAIL]\033[0m  $*" >&2; exit 1; }

# ── Mode check ────────────────────────────────────────────────────────────────
MODE="${1:-start}"

stop_server() {
  info "Stopping Fair Hiring Network (centralized)…"
  pkill -f "centralized.server" 2>/dev/null && ok "Server stopped." || warn "No running server found."
}

if [[ "$MODE" == "stop" ]]; then
  stop_server; exit 0
fi

if [[ "$MODE" == "restart" ]]; then
  stop_server
  sleep 1
fi

# ── Pre-flight ────────────────────────────────────────────────────────────────
info "Checking environment…"

[[ -f "$PYTHON" ]] || PYTHON="$(which python3 2>/dev/null)" || die "Python not found"
ok "Python: $PYTHON"

[[ -f "${DIR}/.env" ]] || warn ".env file not found — using system environment"

# Check Ollama
if curl -sf http://localhost:11434/ > /dev/null 2>&1; then
  ok "Ollama is running"
else
  warn "Ollama not detected at localhost:11434 — LLM calls may fail"
  warn "Start Ollama: ollama serve"
fi

# ── Create log dir ────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Kill any existing instance on the same port ───────────────────────────────
if lsof -ti tcp:"$PORT" > /dev/null 2>&1; then
  warn "Port $PORT is in use — killing existing process…"
  lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── Launch ────────────────────────────────────────────────────────────────────
info "Starting Fair Hiring Network (centralized mode) on port $PORT…"
info "All 6 agents + API server in a SINGLE process."
info "Frontend: http://localhost:${PORT}"
info "API docs: http://localhost:${PORT}/docs"
info "WebSocket: ws://localhost:${PORT}/ws"
echo ""

export CENTRAL_PORT="$PORT"

UVICORN_CMD=(
  "$PYTHON" -m uvicorn
  "centralized.server:app"
  "--host" "0.0.0.0"
  "--port" "$PORT"
  "--log-level" "info"
)

LOG_FILE="${LOG_DIR}/centralized.log"

if [[ "${DETACH:-0}" == "1" ]]; then
  info "Running in background — log: $LOG_FILE"
  nohup "${UVICORN_CMD[@]}" >> "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  sleep 2
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    ok "Server started (PID $SERVER_PID)"
    echo "$SERVER_PID" > "${DIR}/.centralized.pid"
  else
    die "Server failed to start — check $LOG_FILE"
  fi
else
  info "Running in foreground (Ctrl+C to stop)"
  echo "─────────────────────────────────────────────────────────"
  "${UVICORN_CMD[@]}"
fi
