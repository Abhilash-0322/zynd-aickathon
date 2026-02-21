#!/usr/bin/env bash
# ============================================================
# Fair Hiring Network — Start All Services
# Zynd AICKATHON 2026
# ============================================================
set -e

PYTHON=".venv/bin/python"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; PURPLE='\033[0;35m'; NC='\033[0m'

banner() {
  echo -e "${PURPLE}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║   🚀 FAIR HIRING NETWORK — ZYND AICKATHON 2026       ║"
  echo "║   Decentralized · Bias-Free · Transparent            ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

check_ollama() {
  echo -e "${CYAN}[0/7] Checking Ollama...${NC}"
  if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠  Ollama not running. Starting Ollama...${NC}"
    ollama serve &>/dev/null &
    sleep 3
  fi

  echo -e "${CYAN}Checking required models...${NC}"
  BIG_MODEL="${BIG_MODEL:-glm4:9b}"
  SMALL_MODEL="${SMALL_MODEL:-llama3.2:3b}"

  for model in "$SMALL_MODEL"; do
    if ! ollama list 2>/dev/null | grep -q "$model"; then
      echo -e "${YELLOW}Pulling $model ...${NC}"
      ollama pull "$model" || echo -e "${RED}Failed to pull $model. Continuing...${NC}"
    else
      echo -e "${GREEN}✓ $model available${NC}"
    fi
  done
}

start_service() {
  local num="$1"
  local name="$2"
  local script="$3"
  local logfile="$LOG_DIR/$4.log"

  echo -e "${CYAN}[${num}/7] Starting ${name}...${NC}"
  export $(cat .env | grep -v '^#' | xargs) 2>/dev/null || true
  $PYTHON "$script" > "$logfile" 2>&1 &
  local pid=$!
  echo $pid > "$LOG_DIR/$4.pid"
  sleep 2
  if kill -0 $pid 2>/dev/null; then
    echo -e "${GREEN}  ✓ ${name} started (PID: $pid)${NC}"
  else
    echo -e "${RED}  ✗ ${name} failed to start — check $logfile${NC}"
  fi
}

stop_all() {
  echo -e "${YELLOW}Stopping all services...${NC}"
  for pidfile in "$LOG_DIR"/*.pid; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo "Stopped PID $pid"
      fi
      rm -f "$pidfile"
    fi
  done
  # Also kill any leftover Python processes matching our scripts
  pkill -f "skill_verifier_agent.py" 2>/dev/null || true
  pkill -f "bias_detector_agent.py"  2>/dev/null || true
  pkill -f "candidate_matcher_agent.py" 2>/dev/null || true
  pkill -f "privacy_agent.py"        2>/dev/null || true
  pkill -f "credential_agent.py"     2>/dev/null || true
  pkill -f "orchestrator_agent.py"   2>/dev/null || true
  pkill -f "api_server/main.py"      2>/dev/null || true
  echo -e "${GREEN}All stopped.${NC}"
}

main() {
  banner

  if [ "$1" = "stop" ]; then
    stop_all
    exit 0
  fi

  if [ "$1" = "restart" ]; then
    stop_all
    sleep 2
  fi

  check_ollama

  # Load .env
  if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
    echo -e "${GREEN}✓ Environment loaded${NC}"
  fi

  # Start specialized agents first (they need to register with Zynd)
  start_service "1" "Skill Verifier Agent  (port $SKILL_VERIFIER_PORT)"   "agents/skill_verifier_agent.py"    "skill_verifier"
  start_service "2" "Bias Detector Agent   (port $BIAS_DETECTOR_PORT)"     "agents/bias_detector_agent.py"     "bias_detector"
  start_service "3" "Candidate Matcher     (port $CANDIDATE_MATCHER_PORT)" "agents/candidate_matcher_agent.py" "candidate_matcher"
  start_service "4" "Privacy Guardian      (port $PRIVACY_AGENT_PORT)"     "agents/privacy_agent.py"           "privacy_agent"
  start_service "5" "Credential Issuer     (port $CREDENTIAL_AGENT_PORT)"  "agents/credential_agent.py"        "credential_agent"

  echo -e "${CYAN}Waiting for agents to register with Zynd registry...${NC}"
  sleep 5

  # Start orchestrator (needs other agents already registered)
  start_service "6" "Orchestrator Agent    (port $ORCHESTRATOR_PORT)"      "agents/orchestrator_agent.py"      "orchestrator"

  sleep 3

  # Start API server last
  echo -e "${CYAN}[7/7] Starting API Server (port 8000)...${NC}"
  export $(cat .env | grep -v '^#' | xargs) 2>/dev/null || true
  $PYTHON -m uvicorn api_server.main:app --host 0.0.0.0 --port 8000 --reload \
    > "$LOG_DIR/api_server.log" 2>&1 &
  API_PID=$!
  echo $API_PID > "$LOG_DIR/api_server.pid"
  sleep 3

  if kill -0 $API_PID 2>/dev/null; then
    echo -e "${GREEN}  ✓ API Server started (PID: $API_PID)${NC}"
  else
    echo -e "${RED}  ✗ API Server failed — check $LOG_DIR/api_server.log${NC}"
  fi

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 ALL SERVICES RUNNING                              ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  🌐 Frontend:   http://localhost:8000                 ║${NC}"
  echo -e "${GREEN}║  📡 API Docs:   http://localhost:8000/docs            ║${NC}"
  echo -e "${GREEN}║  🔌 WebSocket:  ws://localhost:8000/ws                ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  Agents:                                              ║${NC}"
  echo -e "${GREEN}║    Orchestrator    → port $ORCHESTRATOR_PORT                  ║${NC}"
  echo -e "${GREEN}║    Skill Verifier  → port $SKILL_VERIFIER_PORT                  ║${NC}"
  echo -e "${GREEN}║    Bias Detector   → port $BIAS_DETECTOR_PORT                  ║${NC}"
  echo -e "${GREEN}║    Matcher         → port $CANDIDATE_MATCHER_PORT                  ║${NC}"
  echo -e "${GREEN}║    Privacy Guard   → port $PRIVACY_AGENT_PORT                  ║${NC}"
  echo -e "${GREEN}║    Credential      → port $CREDENTIAL_AGENT_PORT                  ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  Logs: ./logs/                                        ║${NC}"
  echo -e "${GREEN}║  Stop: ./start_all.sh stop                            ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"

  echo ""
  echo -e "${CYAN}Press Ctrl+C to stop all services${NC}"

  # Trap SIGINT/SIGTERM
  trap stop_all INT TERM

  # Tail logs
  if [ "$1" = "--follow" ]; then
    tail -f "$LOG_DIR"/*.log
  else
    wait
  fi
}

main "$@"
