# 🌐 Fair Hiring Network
### Powered by Zynd Protocol | ZYND AICKATHON 2026

> **Problem Statement:** Fair Hiring Network — Future of Work  
> Build agent networks that verify skills, detect bias, and ensure fair opportunities—creating transparency where talented developers are no longer overlooked by biased systems.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies (if not already)
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Start Ollama and pull models
ollama pull llama3.2:3b
ollama pull glm4:9b   # optional big model

# 3. Start everything
./start_all.sh

# 4. Open browser
open http://localhost:8000
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ZYND PROTOCOL REGISTRY                    │
│              (DID-based agent authentication)                │
└──────────────┬────────────────────────────┬─────────────────┘
               │   discover & authenticate   │
┌──────────────▼─────────────────────────────▼─────────────────┐
│                   ORCHESTRATOR AGENT                         │
│           glm4:9b | port 5001 | Coordinates pipeline        │
└──────┬──────────┬───────────┬──────────┬─────────────────────┘
       │          │           │          │
  ┌────▼───┐ ┌───▼────┐ ┌───▼───┐ ┌───▼────────┐ ┌──────────┐
  │Privacy │ │ Bias   │ │Skill  │ │Candidate   │ │Credential│
  │Guardian│ │Detector│ │Verify │ │Matcher     │ │ Issuer   │
  │:5005  │ │ :5003  │ │ :5002 │ │  :5004     │ │  :5006   │
  │llm:3b │ │ llm:3b │ │llm:3b │ │  llm:3b   │ │  llm:3b  │
  └────────┘ └────────┘ └───────┘ └────────────┘ └──────────┘
       │          │           │          │              │
       └──────────┴───────────┴──────────┴──────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   FastAPI Server   │
                    │   port 8000        │
                    │   WebSocket /ws    │
                    └─────────┬──────────┘
                              │ real-time
                    ┌─────────▼──────────┐
                    │   Frontend UI      │
                    │  http://localhost  │
                    │       :8000        │
                    └────────────────────┘
```

---

## 🤖 Agents

| Agent | Port | Model | Role |
|-------|------|-------|------|
| **Orchestrator** | 5001 | `glm4:9b` | Coordinates full pipeline, makes final decision |
| **Skill Verifier** | 5002 | `llama3.2:3b` | Verifies skills with evidence, assigns confidence scores |
| **Bias Detector** | 5003 | `llama3.2:3b` | Scans job descriptions for bias, diversity scoring |
| **Candidate Matcher** | 5004 | `llama3.2:3b` | Objective skills-based match scoring |
| **Privacy Guardian** | 5005 | `llama3.2:3b` | Anonymizes profiles for blind screening |
| **Credential Issuer** | 5006 | `llama3.2:3b` | Issues W3C Verifiable Credentials |

---

## 🔄 Pipeline Flow

```
Application Submitted
        ↓
1. 🔒 Privacy Guardian   → Anonymize candidate profile (removes name, gender, age, etc.)
        ↓
2. ⚖️  Bias Detector     → Scan job description for bias patterns
        ↓
3. 🎯 Skill Verifier     → Verify skills against evidence / portfolio
        ↓
4. 🔗 Candidate Matcher  → Calculate objective match score
        ↓
5. 📜 Credential Issuer  → Issue W3C Verifiable Credential
        ↓
6. 🧠 Orchestrator       → Synthesize final ADVANCE / HOLD / REJECT decision
        ↓
7. 📡 WebSocket broadcast → Real-time update to frontend
```

---

## 🛡️ Key Features

### Verifiable Skill Credentials
- W3C-standard Verifiable Credentials (VCs) issued per assessment
- SHA-256 integrity proof on all credential claims
- DID-based issuer identity via Zynd Protocol
- Persistent, verifiable, tamper-proof records

### Bias Detection
- Linguistic bias patterns (gender, age, cultural)
- Structural bias detection (elitism, nepotism indicators)
- Per-flag severity rating (high / medium / low)
- Suggested inclusive rewrites
- Diversity score + bias-free score

### Privacy-Preserving Verification
- Rule-based PII removal (name → SHA-256 hash, removes email, photo, age, etc.)
- LLM-powered refinement for subtle identifiers
- Blind screening: assessors see only skills and evidence
- GDPR-aligned anonymization

### Transparent Matching
- All match weights and reasoning are shown
- Skill gaps explicitly listed
- No "black box" decisions
- Transferable skills considered

### Real-time Transparency
- Every agent step streamed to frontend via WebSocket
- Full audit trail per application
- Agent DID authentication shown in UI
- Process duration tracked

---

## 📡 API Reference

```
GET  /                         Frontend UI
GET  /docs                     Swagger API docs
GET  /health                   Health check

POST /api/jobs                 Post a job
GET  /api/jobs                 List jobs
GET  /api/jobs/:id             Get job

POST /api/apply                Submit application (triggers pipeline)
GET  /api/applications         List applications
GET  /api/applications/:id     Get application status + results

GET  /api/events               Event log

POST /internal/event           Agent → API server event push (internal)
WS   /ws                       Real-time WebSocket stream
```

---

## ⚙️ Environment Variables

```env
ZYND_API_KEY=zynd_...                     # Your Zynd API key
ZYND_REGISTRY_URL=https://registry.zynd.ai

BIG_MODEL=glm4:9b                         # Orchestrator model
SMALL_MODEL=llama3.2:3b                   # Specialized agent model
OLLAMA_BASE_URL=http://localhost:11434

API_SERVER_URL=http://localhost:8000
ORCHESTRATOR_PORT=5001
SKILL_VERIFIER_PORT=5002
BIAS_DETECTOR_PORT=5003
CANDIDATE_MATCHER_PORT=5004
PRIVACY_AGENT_PORT=5005
CREDENTIAL_AGENT_PORT=5006
```

---

## 🔧 Development

```bash
# Start individual agents for testing
.venv/bin/python agents/skill_verifier_agent.py
.venv/bin/python agents/bias_detector_agent.py
.venv/bin/python agents/candidate_matcher_agent.py
.venv/bin/python agents/privacy_agent.py
.venv/bin/python agents/credential_agent.py
.venv/bin/python agents/orchestrator_agent.py

# Start API server
.venv/bin/python -m uvicorn api_server.main:app --host 0.0.0.0 --port 8000 --reload

# Stop everything
./start_all.sh stop

# View logs
tail -f logs/orchestrator.log
tail -f logs/api_server.log
```

---

## 📁 Project Structure

```
fair-hiring-network/
├── .env                          # API keys + configuration
├── requirements.txt
├── start_all.sh                  # One-command startup
├── README.md
│
├── agents/
│   ├── base_agent.py             # Shared utilities (event bus, memory, LLM factory)
│   ├── orchestrator_agent.py     # Main coordinator (port 5001, big model)
│   ├── skill_verifier_agent.py   # Skill verification (port 5002)
│   ├── bias_detector_agent.py    # Bias detection (port 5003)
│   ├── candidate_matcher_agent.py # Match scoring (port 5004)
│   ├── privacy_agent.py          # Profile anonymization (port 5005)
│   └── credential_agent.py       # VC issuance (port 5006)
│
├── api_server/
│   └── main.py                   # FastAPI + WebSocket event server (port 8000)
│
└── frontend/
    ├── index.html                 # Single-page application
    ├── style.css                  # Dark theme UI
    └── app.js                     # Real-time WebSocket client + UI logic
```

---

## 🏆 Why This Wins

1. **Complete Zynd Integration** — All 6 agents registered with DIDs on Zynd registry, authenticated communication
2. **Real-world Problem Solved** — Directly addresses the algorithmic bias problem in developer hiring
3. **Full Pipeline** — Privacy → Bias → Skill → Match → Credential → Decision in one flow  
4. **Live Transparency** — Every agent decision streamed to frontend in real-time
5. **Verifiable Credentials** — W3C-standard VCs with integrity proofs for skill verification
6. **Production Ready** — Clean code, error handling, fallbacks, modular design

---

Built with ❤️ for ZYND AICKATHON 2026
