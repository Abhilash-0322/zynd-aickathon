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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ValidationError
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

# Custom validation error handler for user-friendly messages
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field = err.get("loc", ["", ""])[-1]
        msg = err.get("msg", "Invalid value").replace("Value error, ", "")
        errors.append(f"{field}: {msg}")
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(errors)},
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
    """Run the pipeline, collecting all events/thinking data for DB persistence."""

    # Buffers to collect events and thinking data during pipeline execution
    event_buffer: list[dict] = []
    thinking_buffers: dict[str, dict] = {}  # agent_name -> {tokens, started_at, completed_at}

    def collecting_emit(token: str, event_type: str, agent_name: str, meta: dict):
        """Wraps _ws_emit to also buffer events for persistence."""
        # Forward to real WS broadcast
        _ws_emit(token, event_type, agent_name, meta)

        # Collect thinking data
        if event_type == "thinking_start":
            thinking_buffers[agent_name] = {
                "tokens": "",
                "started_at": datetime.utcnow(),
                "completed_at": None,
            }
        elif event_type == "token" and agent_name in thinking_buffers:
            thinking_buffers[agent_name]["tokens"] += token
        elif event_type == "thinking_end" and agent_name in thinking_buffers:
            thinking_buffers[agent_name]["completed_at"] = datetime.utcnow()

        # Buffer events (skip raw tokens to keep event log manageable)
        if event_type != "token":
            event_buffer.append({
                "agent_name": agent_name,
                "event_type": event_type,
                "step": meta.get("step") or meta.get("message") or token,
                "status": meta.get("status"),
                "data": {k: v for k, v in meta.items() if k not in ("agent_name",)} if meta else None,
            })

    try:
        result = _pipeline.run(application, collecting_emit)
        _results_db[application_id] = result

        # Persist to PostgreSQL
        if db_app_id:
            try:
                db = SessionLocal()
                # Extract scores from result
                # Pipeline stores scores under result["summary"] key
                results = result or {}
                summary = results.get("summary", results)  # fallback to top-level if no "summary" key
                crud.save_pipeline_result(
                    db,
                    application_id=db_app_id,
                    privacy_score=summary.get("privacy_score", 0),
                    bias_free_score=summary.get("bias_free_score", 0),
                    skill_score=summary.get("skill_score", 0),
                    match_score=summary.get("match_score", 0),
                    overall_score=summary.get("overall_score", 0),
                    recommendation=summary.get("final_decision", "") or summary.get("recommendation", ""),
                    executive_summary=summary.get("executive_summary", ""),
                    key_strengths=summary.get("key_strengths", []),
                    skill_gaps=summary.get("skill_gaps", []),
                    next_steps=summary.get("next_steps", []),
                    fairness_guarantee=summary.get("fairness_guarantee", ""),
                    credential_id=summary.get("credential_id", ""),
                    raw_result=result,
                )

                # Persist agent thinking data
                if thinking_buffers:
                    thinkings_to_save = [
                        {
                            "agent_name": agent_name,
                            "thinking_text": buf["tokens"],
                            "started_at": buf["started_at"],
                            "completed_at": buf["completed_at"],
                        }
                        for agent_name, buf in thinking_buffers.items()
                        if buf["tokens"]  # Only save if there's actual content
                    ]
                    if thinkings_to_save:
                        crud.save_agent_thinkings_bulk(db, application_id=db_app_id, thinkings=thinkings_to_save)
                        log.info(f"Persisted {len(thinkings_to_save)} agent thinking records for {application_id}")

                # Persist pipeline events
                if event_buffer:
                    count = crud.save_pipeline_events_bulk(db, application_id=db_app_id, events=event_buffer)
                    log.info(f"Persisted {count} pipeline events for {application_id}")

                from datetime import datetime as dt
                crud.update_application_status(
                    db, db_app_id, "completed",
                    completed_at=dt.now()
                )
                db.close()
                log.info(f"Pipeline result + history persisted to DB for {application_id}")
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
                # Still persist whatever events we collected before the error
                if event_buffer:
                    crud.save_pipeline_events_bulk(db, application_id=db_app_id, events=event_buffer)
                if thinking_buffers:
                    thinkings_to_save = [
                        {
                            "agent_name": agent_name,
                            "thinking_text": buf["tokens"],
                            "started_at": buf["started_at"],
                            "completed_at": buf["completed_at"],
                        }
                        for agent_name, buf in thinking_buffers.items()
                        if buf["tokens"]
                    ]
                    if thinkings_to_save:
                        crud.save_agent_thinkings_bulk(db, application_id=db_app_id, thinkings=thinkings_to_save)
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
    resume_id: Optional[str] = None             # ID of a previously parsed resume

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
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Submit application. Auth-aware — links to user if authenticated."""
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

    # Try to resolve authenticated user from Authorization header
    db_app_id = None
    user_id = None
    try:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            db = SessionLocal()
            session = crud.get_session(db, token)
            if session and session.user:
                user_id = session.user_id
            db.close()
    except Exception:
        pass

    try:
        db = SessionLocal()
        db_app = crud.create_application(
            db,
            candidate_id=user_id,           # None when anonymous — nullable in DB
            job_id=None,                     # inline jobs don't have a DB job row
            conversation_id=app_id,
        )
        db_app_id = db_app.id
        # Link resume if provided
        if body.resume_id:
            try:
                rid = uuid.UUID(body.resume_id)
                crud.link_resume_to_application(db, db_app_id, rid)
            except (ValueError, Exception) as re:
                log.warning(f"Could not link resume {body.resume_id}: {re}")
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
        "authenticated":   user_id is not None,
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


# ── Pipeline History ──────────────────────────────────────────────────────
@app.get("/api/history")
async def get_history(request: Request):
    """Get pipeline run history for the authenticated user."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Authentication required to view history")

    token = auth_header.split(" ", 1)[1]
    try:
        db = SessionLocal()
        session = crud.get_session(db, token)
        if not session or not session.user:
            db.close()
            raise HTTPException(401, "Invalid or expired token")

        history = crud.get_user_history(db, session.user_id)
        db.close()
        return {"history": history, "count": len(history)}
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"Failed to fetch history: {exc}")
        raise HTTPException(500, "Failed to fetch history")


@app.get("/api/history/{conversation_id}")
async def get_history_detail(conversation_id: str, request: Request):
    """Get full pipeline run detail including thinking, events, and results."""
    # Allow unauthenticated access for shared links, but verify ownership for auth users
    try:
        db = SessionLocal()
        detail = crud.get_application_history_by_conversation(db, conversation_id)
        db.close()
        if not detail:
            raise HTTPException(404, f"No pipeline run found for {conversation_id!r}")
        return detail
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"Failed to fetch history detail: {exc}")
        raise HTTPException(500, "Failed to fetch history detail")


# ── Jobs CRUD ─────────────────────────────────────────────────────

# ── Resume ─────────────────────────────────────────────────────────────────


def _extract_resume_text(filename: str, content: bytes) -> str:
    """Extract plain text from PDF, DOCX, or plain text file bytes."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "txt"
    try:
        if ext == "pdf":
            import pdfplumber, io
            pages = []
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        pages.append(t)
            return "\n".join(pages)
        elif ext in ("docx", "doc"):
            import docx, io
            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        else:  # txt, md, etc.
            return content.decode("utf-8", errors="replace")
    except Exception as exc:
        log.warning(f"Text extraction failed for {filename!r}: {exc}")
        return content.decode("utf-8", errors="replace")


def _parse_resume_with_llm(raw_text: str) -> dict:
    """Use the local LLM (SMALL_MODEL) to extract structured candidate fields."""
    from langchain_ollama import ChatOllama
    from langchain_core.messages import HumanMessage, SystemMessage
    from centralized.agents.base import SMALL_MODEL, OLLAMA_BASE_URL

    llm = ChatOllama(model=SMALL_MODEL, base_url=OLLAMA_BASE_URL, temperature=0)
    snippet = raw_text[:4000]  # keep prompt manageable
    prompt = f"""Extract candidate information from this resume. Return ONLY a valid JSON object with exactly these keys:
- "name": string (full name)
- "email": string (email address or "")
- "experience_years": integer (total years of professional experience)
- "education": string (highest degree + field, e.g. "BS Computer Science")
- "skills": array of strings (technical skills, tools, languages)
- "experience_summary": string (2-3 sentence professional summary)
- "github_url": string (GitHub profile URL or "")
- "portfolio_url": string (portfolio/website URL or "")
- "certifications": array of strings (any certifications or awards)
- "cover_letter": string (always "")

Resume text:
{snippet}

Return ONLY the JSON object, no markdown fences, no explanation."""

    response = llm.invoke([
        SystemMessage(content="You are a resume parser. Return only valid JSON with no markdown."),
        HumanMessage(content=prompt),
    ])
    text = response.content.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(
            line for line in lines
            if not line.startswith("```")
        ).strip()
    return json.loads(text)


@app.post("/api/resume/parse")
async def parse_resume(
    file: UploadFile = File(...),
    request: Request = None,
):
    """Upload a resume (PDF / DOCX / TXT) and extract candidate fields via LLM."""
    MAX_SIZE = 5 * 1024 * 1024  # 5 MB
    allowed = {"pdf", "docx", "doc", "txt", "md"}
    ext = file.filename.lower().rsplit(".", 1)[-1] if file.filename and "." in file.filename else "txt"
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type .{ext}. Allowed: {', '.join(sorted(allowed))}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(413, "File too large (max 5 MB)")
    if not content.strip():
        raise HTTPException(400, "Empty file")

    # Resolve optional auth
    user_id = None
    try:
        auth_header = (request.headers.get("authorization", "") or "") if request else ""
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            db = SessionLocal()
            session = crud.get_session(db, token)
            if session and session.user:
                user_id = session.user_id
            db.close()
    except Exception:
        pass

    loop = asyncio.get_event_loop()

    # Extract text in thread (IO-bound)
    raw_text = await loop.run_in_executor(
        None, _extract_resume_text, file.filename or "resume", content
    )
    if not raw_text.strip():
        raise HTTPException(422, "Could not extract text from the file")

    # LLM parse in thread (CPU + network to Ollama)
    try:
        parsed = await loop.run_in_executor(None, _parse_resume_with_llm, raw_text)
    except Exception as exc:
        log.warning(f"LLM resume parsing failed: {exc} — returning raw text only")
        parsed = {
            "name": "", "email": "", "experience_years": 0,
            "education": "", "skills": [], "experience_summary": raw_text[:500],
            "github_url": "", "portfolio_url": "", "certifications": [], "cover_letter": "",
        }

    # Persist to DB
    resume_id = None
    try:
        db = SessionLocal()
        resume = crud.save_resume(
            db,
            filename=file.filename or "resume",
            raw_text=raw_text,
            parsed_data=parsed,
            file_size=len(content),
            user_id=user_id,
        )
        resume_id = str(resume.id)
        db.close()
        log.info(f"Resume saved: {resume_id} ({file.filename}, {len(content)} bytes)")
    except Exception as exc:
        log.warning(f"Could not persist resume to DB: {exc}")

    return {
        "resume_id": resume_id,
        "filename": file.filename,
        "file_size": len(content),
        "raw_text_length": len(raw_text),
        "parsed": parsed,
    }


@app.get("/api/resumes")
async def list_resumes(request: Request):
    """List all resumes uploaded by the authenticated user."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    token = auth_header.split(" ", 1)[1]
    try:
        db = SessionLocal()
        session = crud.get_session(db, token)
        if not session or not session.user:
            db.close()
            raise HTTPException(401, "Invalid or expired token")
        resumes = crud.get_user_resumes(db, session.user_id)
        db.close()
        return {"resumes": resumes, "count": len(resumes)}
    except HTTPException:
        raise
    except Exception as exc:
        log.warning(f"Failed to list resumes: {exc}")
        raise HTTPException(500, "Failed to list resumes")


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
