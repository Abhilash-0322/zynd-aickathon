"""
Centralized Fair Hiring Network — FastAPI + WebSocket Server
============================================================
Single process:
  - Instantiates all 6 agents at startup
  - Runs the hiring pipeline in a thread (via run_in_executor)
  - Streams every LLM token + event to frontend via WebSocket

WebSocket message envelope:
  { "type": <event_type>, "payload": { ... }, "timestamp": "..." }

event_type values:
  pipeline_event  — pipeline started / completed / error
  step            — agent started a step (text description)
  thinking_start  — agent begins LLM generation
  token           — one LLM token (payload.token, payload.agent_name)
  thinking_end    — agent finished LLM generation
  result          — agent step result summary
  error           — an error in a specific agent
"""

import os
import sys
import asyncio
import json
import logging
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ── Path fix so `centralized.*` imports work when run from project root ──────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from centralized.pipeline import PipelineRunner
from api_server.database import init_db, SessionLocal, get_db
from api_server.auth import router as auth_router, get_current_user, get_optional_user
from api_server import crud

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("FairHiring.Server")

# ─────────────────────────────────────────────────────────────────────────────
# Global state
# ─────────────────────────────────────────────────────────────────────────────
_pipeline: Optional[PipelineRunner] = None
_ws_queue: asyncio.Queue               # sync → async bridge
_event_loop: asyncio.AbstractEventLoop
_jobs_db: Dict[str, dict]  = {}
_results_db: Dict[str, dict] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Startup / shutdown
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline, _ws_queue, _event_loop
    _event_loop = asyncio.get_event_loop()
    _ws_queue   = asyncio.Queue()

    log.info("Instantiating pipeline agents… (this may take a moment)")
    _pipeline = PipelineRunner()

    # Register agents on Zynd in a background thread to not block startup
    threading.Thread(target=_pipeline.register_all, daemon=True, name="zynd-reg").start()

    # Seed a demo job
    demo_jid = "job-demo-1"
    _jobs_db[demo_jid] = {
        "id": demo_jid,
        "title": "Senior Full-Stack Engineer",
        "company": "FairTech Inc.",
        "description": (
            "We are looking for a talented engineer to build scalable web applications. "
            "Must have strong problem-solving skills. Salary: £80-120k."
        ),
        "requirements": [
            "Python", "JavaScript/TypeScript", "React", "FastAPI",
            "PostgreSQL", "Docker", "REST APIs",
        ],
        "nice_to_have": ["Rust", "Kubernetes", "GraphQL", "Kafka"],
        "experience_years": 4,
        "location": "Remote",
        "equity": True,
    }

    # Initialize database tables
    log.info("Initializing PostgreSQL database…")
    init_db()
    log.info("Database ready.")

    asyncio.create_task(_broadcast_worker())
    log.info("Server ready.")
    yield

    log.info("Shutting down.")


app = FastAPI(
    title="Fair Hiring Network — Centralized",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth routes
app.include_router(auth_router)

# Serve frontend
_FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket connection manager
# ─────────────────────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self._connections: set = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        log.info(f"WS connected — total: {len(self._connections)}")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)
        log.info(f"WS disconnected — total: {len(self._connections)}")

    async def broadcast(self, message: dict):
        dead = set()
        async with self._lock:
            connections = set(self._connections)
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        if dead:
            async with self._lock:
                self._connections -= dead

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


async def _broadcast_worker():
    """Drain the asyncio.Queue and broadcast to all WebSocket clients."""
    while True:
        try:
            msg = await _ws_queue.get()
            await manager.broadcast(msg)
        except Exception as exc:
            log.warning(f"Broadcast worker error: {exc}")


def _ws_emit(token: str, event_type: str, agent_name: str, meta: dict):
    """
    Thread-safe: called from synchronous pipeline thread.
    Puts an event on the async queue so the broadcast worker can send it.
    """
    payload = {"agent_name": agent_name, **meta}
    if event_type == "token":
        payload["token"] = token
    elif token:
        payload["message"] = token

    envelope = {
        "type":      event_type,
        "payload":   payload,
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        asyncio.run_coroutine_threadsafe(_ws_queue.put(envelope), _event_loop)
    except Exception as exc:
        log.warning(f"_ws_emit error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline runner (called in executor thread)
# ─────────────────────────────────────────────────────────────────────────────
def _run_pipeline_sync(application: dict, application_id: str, db_app_id=None):
    try:
        result = _pipeline.run(application, _ws_emit)
        _results_db[application_id] = result

        # Persist to PostgreSQL
        if db_app_id:
            try:
                db = SessionLocal()
                # Extract scores from result
                results = result or {}
                crud.save_pipeline_result(
                    db,
                    application_id=db_app_id,
                    privacy_score=results.get("privacy_score", 0),
                    bias_free_score=results.get("bias_free_score", 0),
                    skill_score=results.get("skill_score", 0),
                    match_score=results.get("match_score", 0),
                    overall_score=results.get("overall_score", 0),
                    recommendation=results.get("final_decision", ""),
                    executive_summary=results.get("executive_summary", ""),
                    key_strengths=results.get("key_strengths", []),
                    skill_gaps=results.get("skill_gaps", []),
                    next_steps=results.get("next_steps", []),
                    fairness_guarantee=results.get("fairness_guarantee", ""),
                    credential_id=results.get("credential_id", ""),
                    raw_result=result,
                )
                from datetime import datetime as dt
                crud.update_application_status(
                    db, db_app_id, "completed",
                    completed_at=dt.now()
                )
                db.close()
                log.info(f"Pipeline result persisted to DB for {application_id}")
            except Exception as db_exc:
                log.warning(f"Failed to persist result to DB: {db_exc}")
    except Exception as exc:
        log.exception(f"Pipeline error for {application_id}: {exc}")
        _ws_emit(str(exc), "error", "Server", {
            "conversation_id": application_id,
            "message": f"Pipeline failed: {exc}",
        })
        if db_app_id:
            try:
                db = SessionLocal()
                crud.update_application_status(db, db_app_id, "failed")
                db.close()
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────
class CandidateModel(BaseModel):
    name:             str = "Anonymous Candidate"
    skills:           List[str]     = []
    experience_years: int           = 0
    portfolio:        str           = ""
    portfolio_url:    str           = ""
    github:           str           = ""
    github_url:       str           = ""
    education:        str           = ""
    achievements:     List[str]     = []
    certifications:   List[str]     = []
    cover_letter:     str           = ""
    email:            str           = ""
    experience_summary: str         = ""
    extra:            Dict[str, Any] = {}

class ApplicationModel(BaseModel):
    candidate: CandidateModel
    job_id:    str = "job-demo-1"
    job:       Optional[Dict[str, Any]] = None  # inline job data

class JobModel(BaseModel):
    title:            str
    company:          str          = ""
    description:      str
    requirements:     List[str]    = []
    nice_to_have:     List[str]    = []
    experience_years: int          = 0
    location:         str          = "Remote"
    equity:           bool         = False


# ─────────────────────────────────────────────────────────────────────────────
# REST Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
async def index():
    idx = os.path.join(_FRONTEND_DIR, "index.html")
    if os.path.isfile(idx):
        return FileResponse(idx)
    return {"message": "Fair Hiring Network — Centralized API", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {
        "status":      "healthy",
        "version":     "2.0.0",
        "mode":        "centralized",
        "ws_clients":  manager.count,
        "jobs":        len(_jobs_db),
        "results":     len(_results_db),
        "pipeline":    "ready" if _pipeline else "initializing",
    }


@app.post("/api/apply")
async def apply(
    body: ApplicationModel,
    background_tasks: BackgroundTasks,
    user: Optional[Any] = None,
):
    """Submit application. Optionally auth-aware for DB persistence."""
    if _pipeline is None:
        raise HTTPException(503, "Pipeline not yet initialized — try again in a moment")

    # Resolve job: inline job data takes priority, then job_id lookup
    if body.job:
        job = body.job
    else:
        job = _jobs_db.get(body.job_id)
    if not job:
        raise HTTPException(404, f"Job {body.job_id!r} not found. Provide inline job data or a valid job_id.")

    app_id = str(uuid.uuid4())[:8]
    application = {
        "candidate": body.candidate.model_dump(),
        "job":       job,
    }

    # Try to persist to DB if user is authenticated
    db_app_id = None
    try:
        from fastapi import Request
        # Try to get token from header for optional auth
        db = SessionLocal()
        # Create application record in DB
        db_app = crud.create_application(
            db,
            candidate_id=uuid.UUID('00000000-0000-0000-0000-000000000000'),  # anonymous if no auth
            job_id=uuid.UUID('00000000-0000-0000-0000-000000000000'),  # placeholder
            conversation_id=app_id,
        )
        db_app_id = db_app.id
        db.close()
    except Exception as exc:
        log.warning(f"Could not persist application to DB: {exc}")

    loop = asyncio.get_event_loop()
    background_tasks.add_task(
        loop.run_in_executor, None, _run_pipeline_sync, application, app_id, db_app_id
    )

    return {
        "application_id":  app_id,
        "conversation_id": app_id,
        "status":          "processing",
        "message":         "Pipeline started — connect to /ws for real-time updates",
        "websocket_url":   "/ws",
    }


@app.get("/api/results/{app_id}")
async def get_result(app_id: str):
    r = _results_db.get(app_id)
    if not r:
        raise HTTPException(404, f"No result yet for {app_id!r}")
    return r


@app.get("/api/results")
async def list_results():
    return {"results": list(_results_db.values()), "count": len(_results_db)}


@app.get("/api/applications")
async def list_applications():
    """List all applications with their results from DB."""
    try:
        db = SessionLocal()
        from sqlalchemy import select
        from api_server.database import Application, PipelineResult
        stmt = select(Application).order_by(Application.submitted_at.desc()).limit(50)
        apps = list(db.execute(stmt).scalars().all())
        result = []
        for app_obj in apps:
            app_dict = {
                "id": str(app_obj.id),
                "conversation_id": app_obj.conversation_id,
                "status": app_obj.status.value if hasattr(app_obj.status, 'value') else app_obj.status,
                "submitted_at": app_obj.submitted_at.isoformat() if app_obj.submitted_at else None,
                "completed_at": app_obj.completed_at.isoformat() if app_obj.completed_at else None,
            }
            if app_obj.result:
                app_dict["result"] = {
                    "privacy_score": app_obj.result.privacy_score,
                    "bias_free_score": app_obj.result.bias_free_score,
                    "skill_score": app_obj.result.skill_score,
                    "match_score": app_obj.result.match_score,
                    "overall_score": app_obj.result.overall_score,
                    "recommendation": app_obj.result.recommendation,
                    "executive_summary": app_obj.result.executive_summary,
                    "key_strengths": app_obj.result.key_strengths,
                    "skill_gaps": app_obj.result.skill_gaps,
                    "next_steps": app_obj.result.next_steps,
                    "fairness_guarantee": app_obj.result.fairness_guarantee,
                    "credential_id": app_obj.result.credential_id,
                    "raw_result": app_obj.result.raw_result,
                }
            # Also check in-memory results
            if app_obj.conversation_id in _results_db and "result" not in app_dict:
                app_dict["result"] = _results_db[app_obj.conversation_id]
            result.append(app_dict)
        db.close()
        return {"applications": result, "count": len(result)}
    except Exception as exc:
        log.warning(f"DB query failed, returning in-memory: {exc}")
        return {"applications": [], "count": 0}


# ── Jobs CRUD ─────────────────────────────────────────────────────────────
@app.get("/api/jobs")
async def list_jobs():
    return list(_jobs_db.values())


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    j = _jobs_db.get(job_id)
    if not j:
        raise HTTPException(404, f"Job {job_id!r} not found")
    return j


@app.post("/api/jobs")
async def create_job(body: JobModel):
    jid        = f"job-{uuid.uuid4().hex[:8]}"
    job        = body.model_dump()
    job["id"]  = jid
    job["created_at"] = datetime.utcnow().isoformat()
    _jobs_db[jid] = job
    return {"job_id": jid, "job": job}


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    if job_id not in _jobs_db:
        raise HTTPException(404, f"Job {job_id!r} not found")
    del _jobs_db[job_id]
    return {"deleted": job_id}


# ── WebSocket ─────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current state snapshot
        await websocket.send_json({
            "type": "connection_established",
            "payload": {
                "mode":    "centralized",
                "jobs":    list(_jobs_db.values()),
                "results": len(_results_db),
            },
            "timestamp": datetime.utcnow().isoformat(),
        })
        # Keep alive — receive ping/pong or control messages
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("CENTRAL_PORT", 8000))
    log.info(f"Starting centralized Fair Hiring Network server on port {port}")
    uvicorn.run(
        "centralized.server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
