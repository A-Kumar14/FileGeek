"""
routers/sessions.py — CRUD for study sessions.
"""

import asyncio

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from dependencies import CurrentUser, DB
from models_async import StudySession
from schemas import SessionCreate
from services.registry import rag_service
from utils.cache import get_redis, make_etag, check_etag

router = APIRouter(tags=["sessions"])


@router.get("/sessions")
async def list_sessions(request: Request, response: Response, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession)
        .where(StudySession.user_id == current_user.id)
        .order_by(StudySession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    data = {"sessions": [s.to_dict() for s in sessions]}

    etag = make_etag(data)
    if check_etag(request, etag):
        return Response(status_code=304)

    r = get_redis()
    if r:
        r.set(f"etag:sessions:{current_user.id}", etag, ex=30)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"
    return data


@router.post("/sessions", status_code=201)
async def create_session(data: SessionCreate, current_user: CurrentUser, db: DB):
    session = StudySession(
        user_id=current_user.id,
        title=data.title.strip() or "Untitled Session",
        session_type=data.session_type or "chat",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    r = get_redis()
    if r:
        r.delete(f"etag:sessions:{current_user.id}")
    return {"session": session.to_dict()}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.refresh(session, ["messages", "documents"])
    return {"session": session.to_dict(include_messages=True, include_documents=True)}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await asyncio.get_event_loop().run_in_executor(
        None, rag_service.delete_session_documents, session_id, current_user.id
    )
    await db.delete(session)
    await db.commit()
    r = get_redis()
    if r:
        r.delete(f"etag:sessions:{current_user.id}")
    return {"message": "Session deleted"}
