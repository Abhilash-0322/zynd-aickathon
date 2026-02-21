"""
Fair Hiring Network — API Server
FastAPI server + WebSocket real-time broadcast

Endpoints:
  POST /api/apply               Submit a job application
  POST /api/jobs                Post a job listing
  GET  /api/applications/:id    Get application status
  GET  /api/applications        List all applications
  POST /internal/event          Receive events from agents (internal use)
  WS   /ws                      WebSocket for real-time frontend updates
  GET  /                        Serve frontend

Interactions:
  - Frontend → API → Orchestrator webhook (port 5001)
  - Agents → POST /internal/event → WebSocket broadcast → Frontend
"""

import os
import sys
import json
import uuid
import time
import asyncio
import logging
import threading
import requests
from typing import Dict, List, Any, Optional, Set
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from api_server.auth import router as auth_router
from api_server.database import init_db

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [APIServer] %(levelname)s %(message)s",
)
logger = logging.getLogger("APIServer")

ORCHESTRATOR_URL = f"http://localhost:{os.environ.get('ORCHESTRATOR_PORT', 5001)}/webhook/sync"
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

app = FastAPI(
    title="Fair Hiring Network API",
    description="Decentralized bias-free hiring platform powered by Zynd Protocol",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


# ── In-memory storage ──────────────────────────────────────────────────────────

applications: Dict[str, dict] = {}
events_log: List[dict] = []
jobs: Dict[str, dict] = {}


# ── WebSocket broadcast manager ────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.add(ws)
        logger.info(f"WS client connected. Total: {len(self.active)}")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self.active.discard(ws)
        logger.info(f"WS client disconnected. Total: {len(self.active)}")

    async def broadcast(self, message: dict):
        dead = set()
        for ws in list(self.active):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.add(ws)
        async with self._lock:
            self.active -= dead


ws_manager = ConnectionManager()

# Event queue (thread-safe bridge from sync agent threads to async FastAPI)
_event_queue: asyncio.Queue = None


def get_event_queue() -> asyncio.Queue:
    global _event_queue
    if _event_queue is None:
        _event_queue = asyncio.Queue()
    return _event_queue


async def _broadcast_worker():
    """Background coroutine that drains the event queue and broadcasts."""
    queue = get_event_queue()
    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=1.0)
            await ws_manager.broadcast(event)
            queue.task_done()
        except asyncio.TimeoutError:
            continue
        except Exception as exc:
            logger.error(f"Broadcast worker error: {exc}")


@app.on_event("startup")
async def startup_event():
    init_db()
    asyncio.create_task(_broadcast_worker())
    logger.info("API Server started. Broadcast worker running.")


# ── Pydantic models ────────────────────────────────────────────────────────────

class CandidateProfile(BaseModel):
    name: str
    email: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    experience_years: int = 0
    experience_summary: Optional[str] = None
    education: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    certifications: List[str] = Field(default_factory=list)
    projects: List[dict] = Field(default_factory=list)
    cover_letter: Optional[str] = None
    extra: Optional[dict] = None


class JobPosting(BaseModel):
    title: str
    description: str
    requirements: List[str] = Field(default_factory=list)
    nice_to_have: List[str] = Field(default_factory=list)
    experience_years: int = 0
    company: Optional[str] = None
    location: Optional[str] = None
    remote: bool = False
    salary_range: Optional[str] = None


class ApplicationRequest(BaseModel):
    candidate: CandidateProfile
    job: Optional[JobPosting] = None
    job_id: Optional[str] = None


class EventPayload(BaseModel):
    event_type: str
    agent_name: str
    data: dict
    status: str = "info"
    conversation_id: Optional[str] = None
    step: Optional[str] = None
    timestamp: Optional[str] = None


# ── Internal event endpoint (agents POST here) ─────────────────────────────────

@app.post("/internal/event")
async def receive_agent_event(event: EventPayload):
    """Receive an event from an agent and broadcast to all WebSocket clients."""
    event_dict = event.model_dump()
    event_dict["received_at"] = datetime.utcnow().isoformat()

    events_log.append(event_dict)
    if len(events_log) > 1000:
        events_log.pop(0)

    # Update application status if conversation_id provided
    if event.conversation_id and event.conversation_id in applications:
        app_record = applications[event.conversation_id]
        app_record.setdefault("events", []).append(event_dict)
        if event.event_type == "pipeline_complete":
            app_record["status"] = "completed"
            app_record["completed_at"] = event_dict["received_at"]
        elif event.event_type == "pipeline_start":
            app_record["status"] = "processing"

    # Broadcast to WebSocket clients
    try:
        queue = get_event_queue()
        await queue.put({"type": "agent_event", "payload": event_dict})
    except Exception as exc:
        logger.warning(f"Could not enqueue event: {exc}")

    return {"status": "ok"}


# ── Job endpoints ──────────────────────────────────────────────────────────────

@app.post("/api/jobs", status_code=201)
async def post_job(job: JobPosting):
    """Create a new job posting."""
    job_id = str(uuid.uuid4())[:8]
    job_dict = job.model_dump()
    job_dict["id"] = job_id
    job_dict["created_at"] = datetime.utcnow().isoformat()
    jobs[job_id] = job_dict
    logger.info(f"Job posted: {job.title} (ID: {job_id})")
    return {"job_id": job_id, "job": job_dict}


@app.get("/api/jobs")
async def list_jobs():
    return {"jobs": list(jobs.values()), "count": len(jobs)}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


# ── Application endpoints ──────────────────────────────────────────────────────

@app.post("/api/apply", status_code=202)
async def submit_application(req: ApplicationRequest, background_tasks: BackgroundTasks):
    """Submit a job application and trigger the multi-agent pipeline."""
    conversation_id = str(uuid.uuid4())

    # Resolve job
    job_data = None
    if req.job_id and req.job_id in jobs:
        job_data = jobs[req.job_id]
    elif req.job:
        job_data = req.job.model_dump()
    else:
        raise HTTPException(status_code=400, detail="Provide either job_id or job details")

    # Store application record
    application_record = {
        "id": conversation_id,
        "candidate_name": req.candidate.name,
        "job_title": job_data.get("title", ""),
        "status": "queued",
        "submitted_at": datetime.utcnow().isoformat(),
        "events": [],
    }
    applications[conversation_id] = application_record

    # Broadcast "received" event
    await ws_manager.broadcast({
        "type": "application_received",
        "payload": {
            "conversation_id": conversation_id,
            "candidate_name": req.candidate.name,
            "job_title": job_data.get("title", ""),
            "timestamp": datetime.utcnow().isoformat(),
        }
    })

    # Trigger pipeline in background
    background_tasks.add_task(
        _trigger_pipeline,
        conversation_id,
        req.candidate.model_dump(),
        job_data,
    )

    return {
        "conversation_id": conversation_id,
        "status": "queued",
        "message": "Application received. Multi-agent pipeline is starting.",
        "websocket": "/ws",
        "status_url": f"/api/applications/{conversation_id}",
    }


async def _trigger_pipeline(conversation_id: str, candidate: dict, job: dict):
    """Send application to Orchestrator Agent and wait for result."""
    application_payload = {
        "conversation_id": conversation_id,
        "candidate": candidate,
        "job": job,
    }

    applications[conversation_id]["status"] = "processing"

    def _call_orchestrator():
        """Synchronous call to the orchestrator (runs in thread pool)."""
        from zyndai_agent.message import AgentMessage
        message = AgentMessage(
            content=json.dumps(application_payload),
            sender_id="api-server",
            message_type="query",
        )
        try:
            resp = requests.post(
                ORCHESTRATOR_URL,
                json=message.to_dict(),
                headers={"Content-Type": "application/json"},
                timeout=300,
            )
            if resp.status_code == 200:
                result = resp.json()
                response_data = result.get("response", "{}")
                try:
                    pipeline_result = json.loads(response_data)
                except json.JSONDecodeError:
                    pipeline_result = result
                return pipeline_result
            else:
                logger.error(f"Orchestrator returned {resp.status_code}: {resp.text[:200]}")
                return {"error": f"Orchestrator error: {resp.status_code}"}
        except requests.Timeout:
            return {"error": "Orchestrator timed out"}
        except Exception as exc:
            return {"error": str(exc)}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _call_orchestrator)

    # Store final result
    applications[conversation_id]["result"] = result
    applications[conversation_id]["status"] = result.get("error") and "failed" or "completed"
    applications[conversation_id]["completed_at"] = datetime.utcnow().isoformat()

    # Broadcast final result
    await ws_manager.broadcast({
        "type": "pipeline_result",
        "payload": {
            "conversation_id": conversation_id,
            "result": result,
            "timestamp": datetime.utcnow().isoformat(),
        }
    })


@app.get("/api/applications/{app_id}")
async def get_application(app_id: str):
    if app_id not in applications:
        raise HTTPException(status_code=404, detail="Application not found")
    return applications[app_id]


@app.get("/api/applications")
async def list_applications():
    return {"applications": list(applications.values()), "count": len(applications)}


# ── Events log endpoint ────────────────────────────────────────────────────────

@app.get("/api/events")
async def get_events(limit: int = 100, conversation_id: Optional[str] = None):
    filtered = events_log
    if conversation_id:
        filtered = [e for e in events_log if e.get("conversation_id") == conversation_id]
    return {"events": filtered[-limit:], "count": len(filtered)}


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send recent events on connect
        await websocket.send_text(json.dumps({
            "type": "connected",
            "payload": {
                "message": "Connected to Fair Hiring Network",
                "recent_events": events_log[-20:],
                "applications": list(applications.values())[-10:],
            }
        }))
        # Keep alive
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle ping
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "heartbeat", "timestamp": time.time()}))
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
        await ws_manager.disconnect(websocket)


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "applications": len(applications),
        "jobs": len(jobs),
        "events_logged": len(events_log),
        "ws_clients": len(ws_manager.active),
    }


# ── Static file serving ────────────────────────────────────────────────────────

@app.get("/")
async def serve_frontend():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Frontend not found</h1>")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
