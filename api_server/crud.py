"""
Fair Hiring Network — CRUD Operations
Synchronous SQLAlchemy operations (designed for use with run_in_executor).
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from api_server.database import (
    AgentThinking,
    Application,
    ApplicationStatus,
    Job,
    PipelineEvent,
    PipelineResult,
    Resume,
    Session as DbSession,
    User,
    UserRole,
)


# ── Password helpers ────────────────────────────────────────────────────────────


def _hash_password(password: str) -> str:
    """Hash a password with a random salt using SHA-256.  Suitable for a hackathon;
    swap for bcrypt / argon2 in production."""
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}${password}".encode()).hexdigest()
    return f"{salt}${digest}"


def _verify_password(password: str, hashed: str) -> bool:
    salt, digest = hashed.split("$", 1)
    return hashlib.sha256(f"{salt}${password}".encode()).hexdigest() == digest


# ── User CRUD ───────────────────────────────────────────────────────────────────


def create_user(
    db: Session,
    *,
    email: str,
    name: str,
    password: str,
    role: str = "candidate",
    company: Optional[str] = None,
) -> User:
    """Register a new user."""
    user = User(
        email=email,
        name=name,
        hashed_password=_hash_password(password),
        role=UserRole(role),
        company=company,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Look up a user by email address."""
    stmt = select(User).where(User.email == email)
    return db.execute(stmt).scalar_one_or_none()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Validate credentials and return the user, or None."""
    user = get_user_by_email(db, email)
    if user is None:
        return None
    if not _verify_password(password, user.hashed_password):
        return None
    return user


# ── Job CRUD ────────────────────────────────────────────────────────────────────


def create_job(
    db: Session,
    *,
    title: str,
    description: str,
    requirements: list[str] | None = None,
    nice_to_have: list[str] | None = None,
    experience_years: int = 0,
    company: str,
    location: Optional[str] = None,
    salary_range: Optional[str] = None,
    remote: bool = False,
    posted_by: uuid.UUID,
) -> Job:
    """Create a new job listing."""
    job = Job(
        title=title,
        description=description,
        requirements=requirements,
        nice_to_have=nice_to_have,
        experience_years=experience_years,
        company=company,
        location=location,
        salary_range=salary_range,
        remote=remote,
        posted_by=posted_by,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_jobs(
    db: Session,
    *,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 50,
) -> list[Job]:
    """Return a paginated list of jobs."""
    stmt = select(Job).order_by(Job.created_at.desc()).offset(skip).limit(limit)
    if active_only:
        stmt = stmt.where(Job.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def get_job(db: Session, job_id: uuid.UUID) -> Optional[Job]:
    """Return a single job by ID."""
    stmt = select(Job).where(Job.id == job_id)
    return db.execute(stmt).scalar_one_or_none()


# ── Application CRUD ────────────────────────────────────────────────────────────


def create_application(
    db: Session,
    *,
    candidate_id: Optional[uuid.UUID] = None,
    job_id: Optional[uuid.UUID] = None,
    conversation_id: Optional[str] = None,
) -> Application:
    """Submit a new application, generating a conversation_id if not provided."""
    application = Application(
        conversation_id=conversation_id or f"conv-{uuid.uuid4().hex[:12]}",
        candidate_id=candidate_id,
        job_id=job_id,
        status=ApplicationStatus.queued,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def update_application_status(
    db: Session,
    application_id: uuid.UUID,
    status: str,
    completed_at: Optional[datetime] = None,
) -> Optional[Application]:
    """Update the processing status of an application."""
    stmt = (
        update(Application)
        .where(Application.id == application_id)
        .values(
            status=ApplicationStatus(status),
            completed_at=completed_at,
        )
        .returning(Application)
    )
    result = db.execute(stmt)
    db.commit()
    row = result.scalar_one_or_none()
    if row:
        db.refresh(row)
    return row


def get_user_applications(
    db: Session,
    user_id: uuid.UUID,
    *,
    skip: int = 0,
    limit: int = 50,
) -> list[Application]:
    """Return applications submitted by a specific user."""
    stmt = (
        select(Application)
        .where(Application.candidate_id == user_id)
        .order_by(Application.submitted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


# ── Pipeline Result CRUD ────────────────────────────────────────────────────────


def save_pipeline_result(
    db: Session,
    *,
    application_id: uuid.UUID,
    privacy_score: float = 0.0,
    bias_free_score: float = 0.0,
    skill_score: float = 0.0,
    match_score: float = 0.0,
    overall_score: float = 0.0,
    recommendation: Optional[str] = None,
    executive_summary: Optional[str] = None,
    key_strengths: Optional[list[Any]] = None,
    skill_gaps: Optional[list[Any]] = None,
    next_steps: Optional[list[Any]] = None,
    fairness_guarantee: Optional[str] = None,
    credential_id: Optional[str] = None,
    raw_result: Optional[dict[str, Any]] = None,
) -> PipelineResult:
    """Persist the final pipeline result for an application."""
    result = PipelineResult(
        application_id=application_id,
        privacy_score=privacy_score,
        bias_free_score=bias_free_score,
        skill_score=skill_score,
        match_score=match_score,
        overall_score=overall_score,
        recommendation=recommendation,
        executive_summary=executive_summary,
        key_strengths=key_strengths,
        skill_gaps=skill_gaps,
        next_steps=next_steps,
        fairness_guarantee=fairness_guarantee,
        credential_id=credential_id,
        raw_result=raw_result,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def get_pipeline_result(
    db: Session, application_id: uuid.UUID
) -> Optional[PipelineResult]:
    """Fetch the pipeline result for a given application."""
    stmt = select(PipelineResult).where(
        PipelineResult.application_id == application_id
    )
    return db.execute(stmt).scalar_one_or_none()


# ── Pipeline Event CRUD ─────────────────────────────────────────────────────────


def save_pipeline_event(
    db: Session,
    *,
    application_id: uuid.UUID,
    agent_name: str,
    event_type: str,
    step: Optional[str] = None,
    status: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
) -> PipelineEvent:
    """Record a single pipeline event row."""
    event = PipelineEvent(
        application_id=application_id,
        agent_name=agent_name,
        event_type=event_type,
        step=step,
        status=status,
        data=data,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def save_agent_thinking(
    db: Session,
    *,
    application_id: uuid.UUID,
    agent_name: str,
    thinking_text: str,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
) -> AgentThinking:
    """Persist the full concatenated thinking/reasoning text for an agent."""
    thinking = AgentThinking(
        application_id=application_id,
        agent_name=agent_name,
        thinking_text=thinking_text,
        started_at=started_at or datetime.now(timezone.utc),
        completed_at=completed_at,
    )
    db.add(thinking)
    db.commit()
    db.refresh(thinking)
    return thinking


def save_agent_thinkings_bulk(
    db: Session,
    *,
    application_id: uuid.UUID,
    thinkings: list[dict[str, Any]],
) -> list[AgentThinking]:
    """Save multiple agent thinking records at once."""
    results = []
    for t in thinkings:
        thinking = AgentThinking(
            application_id=application_id,
            agent_name=t["agent_name"],
            thinking_text=t.get("thinking_text", ""),
            started_at=t.get("started_at", datetime.now(timezone.utc)),
            completed_at=t.get("completed_at"),
        )
        db.add(thinking)
        results.append(thinking)
    db.commit()
    for r in results:
        db.refresh(r)
    return results


def save_pipeline_events_bulk(
    db: Session,
    *,
    application_id: uuid.UUID,
    events: list[dict[str, Any]],
) -> int:
    """Save multiple pipeline event records at once. Returns count."""
    for ev in events:
        event = PipelineEvent(
            application_id=application_id,
            agent_name=ev.get("agent_name", "System"),
            event_type=ev.get("event_type", "unknown"),
            step=ev.get("step"),
            status=ev.get("status"),
            data=ev.get("data"),
        )
        db.add(event)
    db.commit()
    return len(events)


def get_application_history(
    db: Session,
    application_id: uuid.UUID,
) -> Optional[dict[str, Any]]:
    """Get full application details including events, thinkings, and results."""
    stmt = select(Application).where(Application.id == application_id)
    app = db.execute(stmt).scalar_one_or_none()
    if not app:
        return None

    return _serialize_application_full(app)


def get_application_history_by_conversation(
    db: Session,
    conversation_id: str,
) -> Optional[dict[str, Any]]:
    """Get full application details by conversation_id."""
    stmt = select(Application).where(Application.conversation_id == conversation_id)
    app = db.execute(stmt).scalar_one_or_none()
    if not app:
        return None

    return _serialize_application_full(app)


def get_user_history(
    db: Session,
    user_id: uuid.UUID,
    *,
    skip: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Get all pipeline runs for a user with summary info."""
    stmt = (
        select(Application)
        .where(Application.candidate_id == user_id)
        .order_by(Application.submitted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    apps = list(db.execute(stmt).scalars().all())
    return [_serialize_application_summary(app) for app in apps]


def _serialize_application_summary(app: Application) -> dict[str, Any]:
    """Serialize application to summary dict."""
    summary: dict[str, Any] = {
        "id": str(app.id),
        "conversation_id": app.conversation_id,
        "status": app.status.value if hasattr(app.status, "value") else str(app.status),
        "submitted_at": app.submitted_at.isoformat() if app.submitted_at else None,
        "completed_at": app.completed_at.isoformat() if app.completed_at else None,
        "has_result": app.result is not None,
        "has_thinkings": len(app.thinkings) > 0 if app.thinkings else False,
        "event_count": len(app.events) if app.events else 0,
    }
    if app.result:
        summary["scores"] = {
            "overall": app.result.overall_score,
            "privacy": app.result.privacy_score,
            "bias_free": app.result.bias_free_score,
            "skill": app.result.skill_score,
            "match": app.result.match_score,
        }
        summary["recommendation"] = app.result.recommendation
    if app.job:
        summary["job_title"] = app.job.title
        summary["company"] = app.job.company
    if app.resume:
        summary["resume"] = {
            "id": str(app.resume.id),
            "filename": app.resume.filename,
            "uploaded_at": app.resume.uploaded_at.isoformat() if app.resume.uploaded_at else None,
        }
    return summary


def _serialize_application_full(app: Application) -> dict[str, Any]:
    """Serialize application with full detail including events, thinkings, results."""
    data = _serialize_application_summary(app)

    # Events
    data["events"] = [
        {
            "id": ev.id,
            "agent_name": ev.agent_name,
            "event_type": ev.event_type,
            "step": ev.step,
            "status": ev.status,
            "data": ev.data,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
        }
        for ev in (app.events or [])
    ]

    # Thinkings
    data["thinkings"] = [
        {
            "id": t.id,
            "agent_name": t.agent_name,
            "thinking_text": t.thinking_text,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        }
        for t in (app.thinkings or [])
    ]

    # Result
    if app.result:
        data["result"] = {
            "id": str(app.result.id),
            "privacy_score": app.result.privacy_score,
            "bias_free_score": app.result.bias_free_score,
            "skill_score": app.result.skill_score,
            "match_score": app.result.match_score,
            "overall_score": app.result.overall_score,
            "recommendation": app.result.recommendation,
            "executive_summary": app.result.executive_summary,
            "key_strengths": app.result.key_strengths,
            "skill_gaps": app.result.skill_gaps,
            "next_steps": app.result.next_steps,
            "fairness_guarantee": app.result.fairness_guarantee,
            "credential_id": app.result.credential_id,
            "raw_result": app.result.raw_result,
            "created_at": app.result.created_at.isoformat() if app.result.created_at else None,
        }

    return data


# ── Session CRUD ────────────────────────────────────────────────────────────────

SESSION_TTL_HOURS = 72


def create_session(db: Session, *, user_id: uuid.UUID) -> DbSession:
    """Create a new auth session with a secure random token."""
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    session = DbSession(
        user_id=user_id,
        token=token,
        created_at=now,
        expires_at=now + timedelta(hours=SESSION_TTL_HOURS),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, token: str) -> Optional[DbSession]:
    """Retrieve a valid (non-expired) session by token."""
    stmt = select(DbSession).where(
        DbSession.token == token,
        DbSession.expires_at > datetime.now(timezone.utc),
    )
    return db.execute(stmt).scalar_one_or_none()


def delete_session(db: Session, token: str) -> bool:
    """Delete a session (logout). Returns True if a row was removed."""
    session = db.execute(
        select(DbSession).where(DbSession.token == token)
    ).scalar_one_or_none()
    if session is None:
        return False
    db.delete(session)
    db.commit()
    return True


# ── Resume CRUD ────────────────────────────────────────────────────────────────────


def save_resume(
    db: Session,
    *,
    filename: str,
    raw_text: str,
    parsed_data: dict,
    file_size: Optional[int] = None,
    user_id: Optional[uuid.UUID] = None,
) -> Resume:
    """Persist a parsed resume to the database."""
    resume = Resume(
        user_id=user_id,
        filename=filename,
        file_size=file_size,
        raw_text=raw_text,
        parsed_data=parsed_data,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


def get_user_resumes(
    db: Session,
    user_id: uuid.UUID,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Get all resumes uploaded by a user, most recent first."""
    stmt = (
        select(Resume)
        .where(Resume.user_id == user_id)
        .order_by(Resume.uploaded_at.desc())
        .limit(limit)
    )
    resumes = list(db.execute(stmt).scalars().all())
    return [
        {
            "id": str(r.id),
            "filename": r.filename,
            "file_size": r.file_size,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "parsed_data": r.parsed_data,
        }
        for r in resumes
    ]


def link_resume_to_application(
    db: Session,
    application_id: uuid.UUID,
    resume_id: uuid.UUID,
) -> None:
    """Associate a resume with an application."""
    db.execute(
        update(Application)
        .where(Application.id == application_id)
        .values(resume_id=resume_id)
    )
    db.commit()
