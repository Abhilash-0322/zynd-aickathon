"""
TalentInfra — Authentication Routes
JWT-free token-based auth using database sessions.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session as DbSession

from api_server.database import get_db, User, init_db
from api_server.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from api_server import crud

logger = logging.getLogger("APIServer.Auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Dependency: get current user from token ────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: DbSession = Depends(get_db),
) -> User:
    """Extract and validate the Bearer token from the Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    token = parts[1]
    session = crud.get_session(db, token)
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return session.user


async def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: DbSession = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising."""
    if not authorization:
        return None
    try:
        return await get_current_user(authorization, db)
    except HTTPException:
        return None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(body: UserCreate, db: DbSession = Depends(get_db)):
    """Register a new user account."""
    existing = crud.get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = crud.create_user(
        db,
        email=body.email,
        name=body.name,
        password=body.password,
        role=body.role,
        company=body.company,
    )

    session = crud.create_session(db, user_id=user.id)

    logger.info(f"User registered: {user.email} ({user.role.value})")

    return TokenResponse(
        token=session.token,
        user=UserResponse.model_validate(user),
        expires_at=session.expires_at,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, db: DbSession = Depends(get_db)):
    """Authenticate and receive a session token."""
    user = crud.authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session = crud.create_session(db, user_id=user.id)

    logger.info(f"User logged in: {user.email}")

    return TokenResponse(
        token=session.token,
        user=UserResponse.model_validate(user),
        expires_at=session.expires_at,
    )


@router.post("/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    db: DbSession = Depends(get_db),
):
    """Invalidate the current session token."""
    if not authorization:
        return {"status": "ok"}

    parts = authorization.split(" ", 1)
    if len(parts) == 2:
        crud.delete_session(db, parts[1])

    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user profile."""
    return UserResponse.model_validate(user)
