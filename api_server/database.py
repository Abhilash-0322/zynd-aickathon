"""
Fair Hiring Network — Database Layer
SQLAlchemy 2.0 models and engine setup for PostgreSQL.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    text,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)

DATABASE_URL = "postgresql://zynd_user:zynd_hack_2026@localhost:5432/zynd_hiring"

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


# ── Enums ───────────────────────────────────────────────────────────────────────


class UserRole(str, enum.Enum):
    candidate = "candidate"
    employer = "employer"
    admin = "admin"


class ApplicationStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


# ── Base ────────────────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


# ── Models ──────────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", create_constraint=True),
        nullable=False,
        default=UserRole.candidate,
    )
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationships
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="poster", lazy="selectin")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="candidate", lazy="selectin"
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role.value})>"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requirements: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    nice_to_have: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    experience_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    posted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    poster: Mapped["User"] = relationship("User", back_populates="jobs", lazy="selectin")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="job", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Job {self.title} @ {self.company}>"


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status", create_constraint=True),
        nullable=False,
        default=ApplicationStatus.queued,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    candidate: Mapped["User | None"] = relationship("User", back_populates="applications", lazy="selectin")
    job: Mapped["Job | None"] = relationship("Job", back_populates="applications", lazy="selectin")
    result: Mapped["PipelineResult | None"] = relationship(
        "PipelineResult", back_populates="application", uselist=False, lazy="selectin"
    )
    events: Mapped[list["PipelineEvent"]] = relationship(
        "PipelineEvent", back_populates="application", lazy="selectin"
    )
    thinkings: Mapped[list["AgentThinking"]] = relationship(
        "AgentThinking", back_populates="application", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Application {self.conversation_id} [{self.status.value}]>"


class PipelineResult(Base):
    __tablename__ = "pipeline_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Scores
    privacy_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bias_free_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    skill_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    match_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Textual results
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Structured results
    key_strengths: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    skill_gaps: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    next_steps: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Zynd-specific
    fairness_guarantee: Mapped[str | None] = mapped_column(Text, nullable=True)
    credential_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Raw agent output
    raw_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    # Relationships
    application: Mapped["Application"] = relationship(
        "Application", back_populates="result", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<PipelineResult app={self.application_id} score={self.overall_score}>"


class PipelineEvent(Base):
    __tablename__ = "pipeline_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    step: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    # Relationships
    application: Mapped["Application"] = relationship(
        "Application", back_populates="events", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<PipelineEvent {self.agent_name}:{self.event_type}>"


class AgentThinking(Base):
    """Stores the full concatenated thinking/reasoning text per agent per application."""
    __tablename__ = "agent_thinkings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(String(255), nullable=False)
    thinking_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    application: Mapped["Application"] = relationship(
        "Application", back_populates="thinkings", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("application_id", "agent_name", name="uq_agent_thinking_app_agent"),
    )

    def __repr__(self) -> str:
        return f"<AgentThinking {self.agent_name} app={self.application_id}>"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="sessions", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Session user={self.user_id}>"


# ── Helpers ─────────────────────────────────────────────────────────────────────


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables that don't already exist."""
    Base.metadata.create_all(bind=engine)
