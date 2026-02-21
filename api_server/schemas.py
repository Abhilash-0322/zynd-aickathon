"""
Fair Hiring Network — Pydantic v2 Schemas
Request / response models for the API layer.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── User ────────────────────────────────────────────────────────────────────────


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(default="candidate", pattern=r"^(candidate|employer|admin)$")
    company: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    company: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    token: str
    user: UserResponse
    expires_at: datetime


# ── Job ─────────────────────────────────────────────────────────────────────────


class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    requirements: list[str] = Field(default_factory=list)
    nice_to_have: list[str] = Field(default_factory=list)
    experience_years: int = Field(default=0, ge=0)
    company: str = Field(..., min_length=1, max_length=255)
    location: Optional[str] = None
    salary_range: Optional[str] = None
    remote: bool = False


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    requirements: Optional[list[Any]] = None
    nice_to_have: Optional[list[Any]] = None
    experience_years: int
    company: str
    location: Optional[str] = None
    salary_range: Optional[str] = None
    remote: bool
    posted_by: uuid.UUID
    created_at: datetime
    is_active: bool


# ── Application ─────────────────────────────────────────────────────────────────


class ApplicationCreate(BaseModel):
    job_id: uuid.UUID
    candidate_id: uuid.UUID


class ApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: str
    candidate_id: uuid.UUID
    job_id: uuid.UUID
    status: str
    submitted_at: datetime
    completed_at: Optional[datetime] = None


# ── Pipeline Result ─────────────────────────────────────────────────────────────


class PipelineResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID

    privacy_score: float
    bias_free_score: float
    skill_score: float
    match_score: float
    overall_score: float

    recommendation: Optional[str] = None
    executive_summary: Optional[str] = None

    key_strengths: Optional[list[Any]] = None
    skill_gaps: Optional[list[Any]] = None
    next_steps: Optional[list[Any]] = None

    fairness_guarantee: Optional[str] = None
    credential_id: Optional[str] = None

    raw_result: Optional[dict[str, Any]] = None
    created_at: datetime
