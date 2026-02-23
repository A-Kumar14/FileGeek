"""
routers/study.py — Flashcard progress (SM-2), quiz generation, analytics, and activity feed.
"""

import asyncio
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select

from dependencies import CurrentUser, DB
from logging_config import get_logger
from models_async import ChatMessage, FlashcardProgress, QuizResult, StudySession
from schemas import FlashcardProgressCreate, QuizResultCreate
from services.registry import tool_executor

logger = get_logger(__name__)
router = APIRouter(tags=["study"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/flashcards/progress")
async def save_flashcard_progress(
    data: FlashcardProgressCreate, current_user: CurrentUser, db: DB
):
    if data.status not in ("remaining", "reviewing", "known"):
        raise HTTPException(status_code=400, detail="Invalid status")

    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == data.session_id,
            StudySession.user_id == current_user.id,
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    prog_result = await db.execute(
        select(FlashcardProgress).where(
            FlashcardProgress.session_id == data.session_id,
            FlashcardProgress.message_id == data.message_id,
            FlashcardProgress.card_index == data.card_index,
        )
    )
    progress = prog_result.scalar_one_or_none()

    if not progress:
        progress = FlashcardProgress(
            session_id=data.session_id,
            message_id=data.message_id,
            card_index=data.card_index,
            card_front=data.card_front[:255],
        )
        db.add(progress)

    progress.status = data.status
    progress.review_count += 1
    progress.updated_at = datetime.utcnow()

    # SM-2 spaced repetition algorithm
    if data.status == "known":
        progress.ease_factor = min(2.5, progress.ease_factor + 0.1)
        progress.interval_days = max(1, int(progress.interval_days * progress.ease_factor))
        progress.next_review_date = datetime.utcnow() + timedelta(days=progress.interval_days)
    elif data.status == "reviewing":
        progress.ease_factor = max(1.3, progress.ease_factor - 0.15)
        progress.interval_days = 1
        progress.next_review_date = datetime.utcnow() + timedelta(days=1)
    else:  # remaining
        progress.ease_factor = max(1.3, progress.ease_factor - 0.3)
        progress.interval_days = 1
        progress.next_review_date = None

    await db.commit()
    await db.refresh(progress)
    return {"message": "Progress saved", "progress": progress.to_dict()}


@router.get("/flashcards/progress/{session_id}/{message_id}")
async def load_flashcard_progress(
    session_id: str, message_id: int, current_user: CurrentUser, db: DB
):
    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    prog_result = await db.execute(
        select(FlashcardProgress)
        .where(
            FlashcardProgress.session_id == session_id,
            FlashcardProgress.message_id == message_id,
        )
        .order_by(FlashcardProgress.card_index)
    )
    records = prog_result.scalars().all()
    return {"progress": [p.to_dict() for p in records]}


@router.get("/flashcards/due")
async def get_due_flashcards(current_user: CurrentUser, db: DB):
    """Return all flashcards due for review today (SM-2 next_review_date <= now)."""
    today = datetime.utcnow()

    sess_result = await db.execute(
        select(StudySession.id).where(StudySession.user_id == current_user.id)
    )
    session_ids = [row[0] for row in sess_result.fetchall()]
    if not session_ids:
        return {"due": [], "total": 0}

    due_result = await db.execute(
        select(FlashcardProgress)
        .where(
            FlashcardProgress.session_id.in_(session_ids),
            FlashcardProgress.next_review_date <= today,
        )
        .order_by(FlashcardProgress.next_review_date)
    )
    due_records = due_result.scalars().all()

    enriched = []
    msg_cache: dict = {}
    for rec in due_records:
        card_back = None
        try:
            if rec.message_id not in msg_cache:
                msg_res = await db.execute(
                    select(ChatMessage).where(ChatMessage.id == rec.message_id)
                )
                msg = msg_res.scalar_one_or_none()
                msg_cache[rec.message_id] = json.loads(msg.artifacts_json or "[]") if msg else []

            artifacts = msg_cache[rec.message_id]
            for art in artifacts:
                if art.get("artifact_type") == "flashcards":
                    cards_data = art.get("content")
                    if isinstance(cards_data, str):
                        cards_data = json.loads(cards_data)
                    if isinstance(cards_data, dict):
                        cards_data = cards_data.get("cards", [])
                    if isinstance(cards_data, list) and len(cards_data) > rec.card_index:
                        card = cards_data[rec.card_index]
                        card_back = card.get("back") or card.get("answer") or card.get("definition")
                    break
        except Exception as exc:
            logger.warning("flashcards.due.enrich.failed card=%s: %s", rec.id, exc)

        row = rec.to_dict()
        row["card_back"] = card_back
        enriched.append(row)

    return {"due": enriched, "total": len(enriched)}


@router.post("/flashcards/generate")
@limiter.limit("10/minute")
async def generate_flashcards_direct(
    request: Request, current_user: CurrentUser, db: DB
):
    """Generate flashcards directly from session documents."""
    data = await request.json()
    session_id = data.get("session_id")
    topic = (data.get("topic") or "").strip() or "the document"
    num_cards = min(int(data.get("num_cards", 8)), 20)

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found or not authorized")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: tool_executor.execute(
            "generate_flashcards",
            {"topic": topic, "num_cards": num_cards, "card_type": "mixed"},
            session_id,
            current_user.id,
        ),
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    content = result.get("content")
    if not content:
        raise HTTPException(
            status_code=422,
            detail="No document content found. Upload and index a document first.",
        )

    return {
        "cards": content,
        "topic": result.get("topic", topic),
        "card_type": result.get("card_type", "mixed"),
        "total": len(content),
    }


@router.post("/quiz/generate")
@limiter.limit("10/minute")
async def generate_quiz_direct(
    request: Request, current_user: CurrentUser, db: DB
):
    """Generate a quiz directly from session documents."""
    data = await request.json()
    session_id = data.get("session_id")
    topic = (data.get("topic") or "").strip() or "the document"
    num_questions = min(int(data.get("num_cards", data.get("num_questions", 5))), 10)

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found or not authorized")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: tool_executor.execute(
            "generate_quiz",
            {"topic": topic, "num_questions": num_questions},
            session_id,
            current_user.id,
        ),
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    content = result.get("content")
    if not content:
        raise HTTPException(
            status_code=422,
            detail="No document content found. Upload and index a document first.",
        )

    return {"questions": content, "topic": result.get("topic", topic), "total": len(content)}


@router.get("/sessions/{session_id}/activity")
async def get_session_activity(session_id: str, current_user: CurrentUser, db: DB):
    """Aggregate activity (messages, quiz results, flashcard progress) for the Document Dashboard."""
    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.role == "assistant")
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    messages = msgs_result.scalars().all()

    quiz_res = await db.execute(
        select(QuizResult).where(QuizResult.session_id == session_id).order_by(QuizResult.created_at.desc())
    )
    quizzes = quiz_res.scalars().all()

    fc_res = await db.execute(
        select(FlashcardProgress).where(FlashcardProgress.session_id == session_id)
    )
    fc_records = fc_res.scalars().all()
    known = sum(1 for r in fc_records if r.status == "known")
    reviewing = sum(1 for r in fc_records if r.status == "reviewing")

    return {
        "session_id": session_id,
        "recent_messages": [
            {"id": m.id, "content": m.content[:200], "created_at": m.created_at.isoformat()}
            for m in messages
        ],
        "quiz_results": [q.to_dict() for q in quizzes],
        "flashcard_summary": {
            "total": len(fc_records),
            "known": known,
            "reviewing": reviewing,
            "remaining": len(fc_records) - known - reviewing,
        },
    }


@router.get("/flashcards/progress/summary/{session_id}")
async def get_flashcard_mastery_summary(session_id: str, current_user: CurrentUser, db: DB):
    """Return per-card mastery data grouped by message_id for the MasteryHeatmap."""
    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    fc_res = await db.execute(
        select(FlashcardProgress)
        .where(FlashcardProgress.session_id == session_id)
        .order_by(FlashcardProgress.message_id, FlashcardProgress.card_index)
    )
    records = fc_res.scalars().all()

    groups: dict = {}
    for r in records:
        mid = str(r.message_id)
        if mid not in groups:
            groups[mid] = {"message_id": r.message_id, "cards": []}
        groups[mid]["cards"].append({
            "card_index": r.card_index,
            "front": r.card_front,
            "status": r.status,
            "ease_factor": r.ease_factor,
            "review_count": r.review_count,
            "next_review_date": r.next_review_date.isoformat() if r.next_review_date else None,
        })

    return {"session_id": session_id, "groups": list(groups.values())}


@router.post("/quiz/results")
async def save_quiz_result(data: QuizResultCreate, current_user: CurrentUser, db: DB):
    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == data.session_id,
            StudySession.user_id == current_user.id,
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    result = QuizResult(
        session_id=data.session_id,
        message_id=data.message_id,
        topic=data.topic,
        score=data.score,
        total_questions=data.total_questions,
        answers_json=json.dumps(data.answers),
        time_taken=data.time_taken,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)
    return {"message": "Quiz result saved", "result": result.to_dict()}


@router.get("/analytics/summary")
async def get_analytics_summary(current_user: CurrentUser, db: DB):
    sessions_result = await db.execute(
        select(StudySession).where(StudySession.user_id == current_user.id)
    )
    sessions = sessions_result.scalars().all()
    session_ids = [s.id for s in sessions]

    if session_ids:
        quiz_result = await db.execute(
            select(QuizResult)
            .where(QuizResult.session_id.in_(session_ids))
            .order_by(QuizResult.created_at.desc())
        )
        quiz_results = quiz_result.scalars().all()

        fc_result = await db.execute(
            select(FlashcardProgress).where(
                FlashcardProgress.session_id.in_(session_ids)
            )
        )
        fc_records = fc_result.scalars().all()
    else:
        quiz_results = []
        fc_records = []

    total_quizzes = len(quiz_results)
    avg_score = (
        round(
            sum(
                q.score / q.total_questions * 100
                for q in quiz_results
                if q.total_questions > 0
            )
            / total_quizzes,
            1,
        )
        if total_quizzes > 0
        else 0
    )
    today = datetime.utcnow().date()
    cards_due = sum(
        1
        for r in fc_records
        if r.next_review_date and r.next_review_date.date() <= today
    )

    return {
        "total_sessions": len(sessions),
        "total_quizzes": total_quizzes,
        "avg_quiz_score": avg_score,
        "recent_quizzes": [q.to_dict() for q in quiz_results[:10]],
        "total_flashcards": len(fc_records),
        "known_flashcards": sum(1 for r in fc_records if r.status == "known"),
        "reviewing_flashcards": sum(1 for r in fc_records if r.status == "reviewing"),
        "cards_due_today": cards_due,
    }
