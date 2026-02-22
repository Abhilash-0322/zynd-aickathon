# 🌐 TalentInfra
### A fair hiring network powered by Zynd Protocol | ZYND AICKATHON 2026

> **TalentInfra** — bias-aware, privacy-preserving, multi-agent hiring infrastructure  
> Six specialist AI agents verify skills, detect bias, anonymize profiles, and issue W3C Verifiable Credentials — creating a transparent pipeline where talent is never overlooked by biased systems.

🔗 **Live:** https://zynd-hiring-app.azurewebsites.net

---

## 🚀 Quick Start (Local Dev)

```bash
# 1. Clone & install
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Set up LLM (choose one)
# Option A — Ollama (local, free)
ollama pull llama3.2:3b

# Option B — Groq (cloud, fast)
export LLM_PROVIDER=groq
export GROQ_API_KEY=your_key_here

# 3. Start the centralized server
uvicorn centralized.server:app --host 0.0.0.0 --port 8000

# 4. Open browser
open http://localhost:8000
```

---

## 🏗️ Architecture

TalentInfra runs as a **single-process monolith** — all 6 agents + FastAPI + Next.js frontend served from one `uvicorn` process. No microservices to manage.

```
┌──────────────────────────────────────────────────────────────────┐
│                      TalentInfra Server                          │
│                   (centralized/server.py)                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  PipelineRunner                         │    │
│  │                                                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ Privacy  │ │  Bias    │ │  Skill   │ │Candidate │  │    │
│  │  │ Guardian │ │ Detector │ │ Verifier │ │ Matcher  │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │    │
│  │  ┌──────────┐ ┌──────────┐                             │    │
│  │  │Credential│ │Orchestr- │                             │    │
│  │  │  Issuer  │ │  ator    │                             │    │
│  │  └──────────┘ └──────────┘                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  FastAPI REST API  ·  WebSocket /ws  ·  Next.js static export   │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  PostgreSQL (prod) │
                    │  SQLite (local)    │
                    └────────────────────┘
```

---

## 🤖 Agents

| Agent | Role |
|-------|------|
| **Orchestrator** | Coordinates full pipeline, makes final ADVANCE / HOLD / REJECT decision |
| **Skill Verifier** | Verifies skills against evidence, assigns confidence scores |
| **Bias Detector** | Scans job descriptions for linguistic & structural bias |
| **Candidate Matcher** | Objective skills-based match scoring with reasoning |
| **Privacy Guardian** | Anonymizes profiles — removes PII for blind screening |
| **Credential Issuer** | Issues W3C Verifiable Credentials with SHA-256 integrity proofs |

All agents are registered with DIDs on the **Zynd Protocol registry** for authenticated communication.

---

## 🔄 Pipeline Flow

```
Application Submitted
        ↓
1. 🔒 Privacy Guardian   → Anonymize candidate profile (PII removed / hashed)
        ↓
2. ⚖️  Bias Detector     → Scan job description for bias patterns
        ↓
3. 🎯 Skill Verifier     → Verify skills against evidence / portfolio
        ↓
4. 🔗 Candidate Matcher  → Calculate objective match score
        ↓
5. 📜 Credential Issuer  → Issue W3C Verifiable Credential
        ↓
6. 🧠 Orchestrator       → Synthesize final decision
        ↓
7. 📡 WebSocket broadcast → Real-time update to frontend
```

---

## ☁️ Production Deployment (Azure)

Deployed on **Azure App Service** (B1 Linux, Python 3.12) with **Azure PostgreSQL Flexible Server**.

| Resource | Detail |
|----------|--------|
| App Service | `zynd-hiring-app.azurewebsites.net` |
| PostgreSQL | `zynd-hiring-pgserver.postgres.database.azure.com` |
| Region | Central India |
| LLM Provider | Groq (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`) |

### Environment Variables (Azure App Settings)

```env
LLM_PROVIDER=groq
GROQ_API_KEY=...
GROQ_BIG_MODEL=llama-3.3-70b-versatile
GROQ_SMALL_MODEL=llama-3.1-8b-instant
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
ZYND_API_KEY=...
ZYND_REGISTRY_URL=https://registry.zynd.ai
WEBSITES_PORT=8000
```

### Manual Deploy (ZIP deploy)

```bash
# Build frontend
cd web && npm ci && npm run build && cd ..

# Package
zip -r deploy.zip . \
  --exclude "*.git*" --exclude "*/__pycache__/*" --exclude "*.pyc" \
  --exclude "*/node_modules/*" --exclude "web/.next/*" \
  --exclude ".venv/*" --exclude "logs/*" -q

# Deploy
az webapp deploy -g zynd-hiring-rg -n zynd-hiring-app \
  --src-path deploy.zip --type zip
```

### Startup Command

```
uvicorn centralized.server:app --host 0.0.0.0 --port 8000
```

---

## 🛡️ Key Features

### Verifiable Skill Credentials
- W3C-standard Verifiable Credentials (VCs) issued per assessment
- SHA-256 integrity proof on all credential claims
- DID-based issuer identity via Zynd Protocol

### Bias Detection
- Linguistic bias patterns (gender, age, cultural)
- Structural bias detection (elitism, nepotism indicators)
- Per-flag severity rating (high / medium / low) with suggested rewrites

### Privacy-Preserving Verification
- Rule-based PII removal (name → SHA-256 hash, removes email, age, photo)
- LLM-powered refinement for subtle identifiers
- GDPR-aligned blind screening

### Real-time Transparency
- Every agent step streamed to frontend via WebSocket
- Full audit trail per application with agent DID shown in UI
- Apply page redirects to `/live` for live tracking

---

## 📡 API Reference

```
GET  /health                   Health check + pipeline status
GET  /docs                     Swagger UI

POST /api/auth/signup          Register
POST /api/auth/login           Login (returns JWT)

POST /api/jobs                 Post a job
GET  /api/jobs                 List jobs

POST /api/apply                Submit application (triggers pipeline)
GET  /api/applications/:id     Get application status + results

WS   /ws                       Real-time WebSocket stream
```

---

## ⚙️ Local Environment Variables

```env
# LLM — pick one provider
LLM_PROVIDER=ollama                       # or groq / openai
OLLAMA_BASE_URL=http://localhost:11434
GROQ_API_KEY=...
OPENAI_API_KEY=...

# Zynd Protocol
ZYND_API_KEY=zynd_...
ZYND_REGISTRY_URL=https://registry.zynd.ai

# Database (defaults to SQLite if not set)
DATABASE_URL=postgresql://user:pass@localhost:5432/zynd_hiring
```

---

## 📁 Project Structure

```
TalentInfra/
├── centralized/
│   ├── server.py               # FastAPI + WebSocket + Next.js SPA serve
│   ├── pipeline.py             # PipelineRunner — orchestrates all agents
│   └── agents/
│       ├── base.py             # Shared base class + Zynd DID registration
│       ├── orchestrator.py
│       ├── skill.py
│       ├── bias.py
│       ├── matcher.py
│       ├── privacy.py
│       └── credential.py
│
├── api_server/
│   ├── database.py             # SQLAlchemy models (PostgreSQL / SQLite)
│   ├── auth.py                 # JWT auth routes
│   ├── crud.py
│   └── schemas.py
│
├── web/                        # Next.js 15 frontend (App Router)
│   ├── src/app/                # Pages: /, /apply, /live, /jobs, /results, /history
│   ├── src/components/
│   ├── src/lib/api.ts          # API client (runtime same-origin detection)
│   └── out/                    # Static export served by FastAPI
│
├── requirements.txt
├── start_all.sh
└── .github/workflows/
    └── azure-deploy.yml        # CI/CD → Azure App Service
```

---

## 🐛 Notable Fixes Applied

| Issue | Fix |
|-------|-----|
| `ERR_CONNECTION_REFUSED` to `localhost:8000` in production | Runtime API URL detection: `hostname !== "localhost" ? "" : fallback` — API calls become relative (same-origin) on Azure |
| `405 Method Not Allowed` on page routes (`/jobs`, `/auth/login`, etc.) | SPA catch-all changed from `@app.get` to `@app.api_route(methods=["GET","HEAD"])` to handle Next.js prefetch HEAD requests |
| Container crash at startup (exit code 1) — DB connection blocking lifespan | `init_db()` moved to background daemon thread; `yield` reached in <2s regardless of DB state |
| SQLAlchemy `Could not parse URL` — `%40` encoded `@` in password | Reset DB password to alphanumeric only; no URL-encoding needed |
| WebSocket URL using `localhost` in production | `getWsUrl()` in `utils.ts` derives URL from `window.location` when API_URL is empty |

---

## 🏆 Why This Wins

1. **Complete Zynd Integration** — All 6 agents registered with DIDs on Zynd Protocol registry
2. **Real-world Problem Solved** — Directly addresses algorithmic bias in developer hiring
3. **Full Pipeline** — Privacy → Bias → Skill → Match → Credential → Decision in one flow
4. **Live Transparency** — Every agent decision streamed to frontend in real-time
5. **Production Deployed** — Live on Azure with PostgreSQL + Groq LLM
6. **Verifiable Credentials** — W3C-standard VCs with integrity proofs

---

Built with ❤️ for ZYND AICKATHON 2026
