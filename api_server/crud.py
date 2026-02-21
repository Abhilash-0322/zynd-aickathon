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
    Application,
    ApplicationStatus,
    Job,
    PipelineEvent,
    PipelineResult,
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
    candidate_id: uuid.UUID,
    job_id: uuid.UUID,
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
