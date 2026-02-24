"""
routers/chat.py — SSE streaming chat endpoint and message feedback.

The agentic pipeline now uses chat_engine.generate_response() directly (async).
No threading.Thread, no queue.Queue — those are gone.

Heartbeat strategy: asyncio.create_task() + asyncio.wait_for(shield()) so that
SSE keep-alive pings flow every HEARTBEAT_INTERVAL seconds while the LLM thinks,
preventing reverse-proxy idle-connection timeouts (Render, Cloudflare).
"""

import asyncio
import json
import re
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, func

from dependencies import CurrentUser, DB
from logging_config import get_logger
from models_async import ChatMessage, SessionDocument, StudySession
from schemas import ChatMessageCreate, FeedbackCreate
from services.ai_service import AIService
from services.registry import chat_engine, memory_service
from utils.cache import get_redis

logger = get_logger(__name__)
router = APIRouter(tags=["chat"])
limiter = Limiter(key_func=get_remote_address)

_HEARTBEAT_INTERVAL = 10   # seconds between keep-alive pings


@router.post("/sessions/{session_id}/messages")
@limiter.limit("20/minute")
async def send_session_message(
    session_id: str,
    data: ChatMessageCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
):
    from utils.validators import InputValidator, check_prompt_injection

    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    question = data.question.strip()
    is_valid, error_msg = InputValidator.validate_question(question)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    if check_prompt_injection(question):
        logger.warning(
            "prompt_injection.detected",
            question_prefix=question[:80],
            session_id=session_id,
        )

    deep_think = data.deepThink
    custom_model = data.model

    user_msg = ChatMessage(session_id=session_id, role="user", content=question)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # Generate title in the background so it doesn't block the SSE stream
    if session.title in ["New Chat", "Untitled Session"]:
        result_count = await db.execute(
            select(func.count()).where(ChatMessage.session_id == session_id)
        )
        count = result_count.scalar()
        if count == 1:
            async def _bg_title():
                try:
                    new_title = await chat_engine.generate_chat_title(question)
                    if new_title and new_title != "New Chat":
                        session.title = new_title
                        await db.commit()
                        r = get_redis()
                        if r:
                            r.delete(f"etag:sessions:{current_user.id}")
                except Exception as exc:
                    logger.warning("bg_title.failed", error=str(exc))
            asyncio.create_task(_bg_title())

    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .limit(20)
    )
    recent_msgs = msgs_result.scalars().all()
    chat_history = [{"role": m.role, "content": m.content} for m in recent_msgs[:-1]]

    memory_context = ""
    preference_context = ""
    try:
        memories = await memory_service.retrieve_relevant_memory_async(
            current_user.id, question, 3
        )
        if memories:
            memory_context = " | ".join(memories[:3])
        preference_context = await memory_service.get_user_preferences_async(current_user.id)
    except Exception as exc:
        logger.warning("memory.retrieval.failed", error=str(exc))

    model_override = custom_model or (AIService.RESPONSE_MODEL if deep_think else None)

    try:
        docs_count_result = await db.execute(
            select(func.count()).where(SessionDocument.session_id == session_id)
        )
        has_documents = (docs_count_result.scalar() or 0) > 0
    except Exception:
        has_documents = False

    # ── SSE generator ──────────────────────────────────────────────────────

    async def generate_response():
        # Send initial heartbeat immediately so the client knows we're alive
        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

        # Run the agentic loop as a background task
        task = asyncio.create_task(
            chat_engine.generate_response(
                question=question,
                session_id=session_id,
                user_id=current_user.id,
                chat_history=chat_history,
                db=db,
                model=model_override,
                deep_think=deep_think,
                has_documents=has_documents,
                memory_context=memory_context,
                preference_context=preference_context,
            )
        )

        # Poll with heartbeats while the task is running
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=_HEARTBEAT_INTERVAL)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

        # Check for exception
        if task.exception():
            exc = task.exception()
            err_str = str(exc)
            _vec_keywords = ("chroma", "sqlite", "disk image", "corrupt",
                             "no such table", "locked", "vector", "collection")
            if any(kw in err_str.lower() for kw in _vec_keywords):
                logger.error("vectorstore.unreachable: %s", err_str)
                yield f"data: {json.dumps({'error': 'Vector store unavailable. Please re-upload your document and try again.'})}\n\n"
            else:
                logger.error("ai.failed: %s", err_str)
                yield f"data: {json.dumps({'error': 'AI response failed. Please try again.'})}\n\n"
            return

        ai_result = task.result()

        # ── Post-process ────────────────────────────────────────────────────
        answer = ai_result.get("answer", "")
        sources = ai_result.get("sources", [])
        artifacts = ai_result.get("artifacts", [])
        suggestions = ai_result.get("suggestions", [])

        # Inject parsed content into artifacts that are missing it
        if artifacts:
            for art in artifacts:
                if art.get("artifact_type") in ("flashcards", "quiz") and not art.get("content"):
                    parsed_content = None
                    for m in re.finditer(r'\[', answer):
                        start = m.start()
                        depth = 0
                        for i, ch in enumerate(answer[start:], start=start):
                            if ch == '[':
                                depth += 1
                            elif ch == ']':
                                depth -= 1
                            if depth == 0:
                                candidate = answer[start:i + 1]
                                try:
                                    parsed = json.loads(candidate)
                                    if isinstance(parsed, list) and len(parsed) > 0:
                                        parsed_content = parsed
                                except json.JSONDecodeError:
                                    pass
                                break
                        if parsed_content:
                            break
                    if parsed_content:
                        art["content"] = parsed_content

        assistant_msg = ChatMessage(
            session_id=session_id,
            role="assistant",
            content=answer,
            sources_json=json.dumps(sources),
            artifacts_json=json.dumps(artifacts),
            suggestions_json=json.dumps(suggestions),
            tool_calls_json=json.dumps(ai_result.get("tool_calls", [])),
        )
        db.add(assistant_msg)
        session.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(assistant_msg)

        for artifact in artifacts:
            artifact["message_id"] = assistant_msg.id
            artifact["session_id"] = session_id

        if artifacts:
            yield f"data: {json.dumps({'artifacts': artifacts, 'message_id': assistant_msg.id})}\n\n"
            await asyncio.sleep(0)

        for i in range(0, len(answer), 50):
            yield f"data: {json.dumps({'chunk': answer[i:i+50]})}\n\n"
            await asyncio.sleep(0)

        yield f"data: {json.dumps({'done': True, 'answer': answer, 'message_id': assistant_msg.id, 'sources': sources, 'artifacts': artifacts, 'suggestions': suggestions})}\n\n"

    return StreamingResponse(
        generate_response(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/messages/{message_id}/feedback")
async def message_feedback(
    message_id: int, data: FeedbackCreate, current_user: CurrentUser, db: DB
):
    if data.feedback not in ("up", "down"):
        raise HTTPException(status_code=400, detail="Feedback must be 'up' or 'down'")

    msg_result = await db.execute(
        select(ChatMessage).where(ChatMessage.id == message_id)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    sess_result = await db.execute(
        select(StudySession).where(
            StudySession.id == msg.session_id,
            StudySession.user_id == current_user.id,
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")

    msg.feedback = data.feedback
    await db.commit()

    try:
        user_msg_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == msg.session_id,
                ChatMessage.role == "user",
                ChatMessage.id < msg.id,
            ).order_by(ChatMessage.id.desc()).limit(1)
        )
        user_msg = user_msg_result.scalar_one_or_none()
        if user_msg:
            await memory_service.store_interaction_async(
                user_id=current_user.id,
                question=user_msg.content,
                answer=msg.content[:300],
                feedback=data.feedback,
                session_id=msg.session_id,
            )
    except Exception as exc:
        logger.warning("memory.feedback.failed", error=str(exc))

    return {"message": "Feedback recorded"}
