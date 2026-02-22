"""FileGeek FastAPI application — replaces app.py."""

import asyncio
import hashlib
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

from fastapi import (
    Depends, FastAPI, HTTPException, Request, Response, UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Config
from database import get_db, init_db
from socket_manager import socket_app
from dependencies import CurrentUser, DB, get_current_user
from models_async import (
    ChatMessage, FlashcardProgress, QuizResult, SessionDocument, StudySession, User,
)
from routers.auth import router as auth_router
from schemas import (
    ChatMessageCreate, DocumentCreate, ExportRequest, FeedbackCreate,
    FlashcardProgressCreate, NotionExportRequest, QuizResultCreate,
    S3PresignRequest, SessionCreate, TTSRequest,
)
from services.ai_service import AIService, PersonaManager
from services.file_service import FileService
from services.rag_service import RAGService, MemoryService
from services.tools import ToolExecutor
from logging_config import get_logger
from utils.validators import InputValidator, check_prompt_injection

logger = get_logger(__name__)

# ── Services (module-level singletons) ────────────────────────────────────────
ai_service = AIService()
file_service = FileService()
rag_service = RAGService(ai_service, file_service)
memory_service = MemoryService(ai_service)
tool_executor = ToolExecutor(rag_service, ai_service)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Celery ─────────────────────────────────────────────────────────────────────
_celery_available = False
try:
    from celery_app import celery_app  # noqa: F401
    _celery_available = True
    logger.info("celery.initialized")
except Exception as exc:
    logger.warning("celery.unavailable", error=str(exc))

# ── Rate limiter (slowapi) ─────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("database.initialized")
    yield


# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="FileGeek API", version="5.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://filegeek.vercel.app",
        *([o for o in (os.getenv("CORS_ORIGINS", "").split(",")) if o.strip()]),
    ],
    allow_origin_regex=r"https://.*\.(vercel\.app|onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount auth router ──────────────────────────────────────────────────────────
app.include_router(auth_router)

# ── Mount Socket.IO at /socket.io ──────────────────────────────────────────────
app.mount("/socket.io", socket_app)

# ── Request logging middleware ─────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(
        "request.received",
        ip=request.client.host if request.client else "unknown",
        method=request.method,
        path=request.url.path,
    )
    return await call_next(request)


# ── Helper ─────────────────────────────────────────────────────────────────────
ALLOWED_URL_PREFIXES = (
    "https://utfs.io/",
    "https://uploadthing.com/",
    "https://ufs.sh/",
    "https://4k40e5rcbl.ufs.sh/",
)


# ── ETag / Redis cache helpers ─────────────────────────────────────────────────
_redis_client = None


def _get_redis():
    """Return a Redis client if available, else None (graceful fallback)."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis as _redis_lib
        r = _redis_lib.from_url(Config.REDIS_URL, socket_connect_timeout=1, decode_responses=True)
        r.ping()
        _redis_client = r
        return r
    except Exception:
        return None


def _make_etag(data: dict | list) -> str:
    """Compute a quoted MD5 ETag from JSON-serialisable data."""
    digest = hashlib.md5(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()
    return f'"{digest}"'


def _check_etag(request: Request, etag: str) -> bool:
    """Return True when the client's If-None-Match matches the ETag (304 path)."""
    return request.headers.get("if-none-match") == etag


# ── Health & Personas ──────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    # Probe ChromaDB
    chroma_ok = False
    try:
        rag_service.collection.count()
        chroma_ok = True
    except Exception as exc:
        logger.warning("health.chromadb.down", error=str(exc))

    # Probe Redis
    redis_ok = False
    try:
        import redis as _redis
        from config import Config
        r = _redis.from_url(Config.REDIS_URL or "redis://localhost:6379")
        r.ping()
        redis_ok = True
    except Exception as exc:
        logger.warning("health.redis.down", error=str(exc))

    overall = "healthy" if chroma_ok else "degraded"
    return {
        "status": overall,
        "timestamp": datetime.now().isoformat(),
        "version": "5.0.0",
        "celery_available": _celery_available,
        "chromadb": "ok" if chroma_ok else "unavailable",
        "redis": "ok" if redis_ok else "unavailable",
    }


@app.get("/workers/status")
async def workers_status():
    """Report Celery worker availability so the UI can warn users."""
    if not _celery_available:
        return {"available": False, "workers": [], "reason": "Celery not configured"}
    try:
        i = celery_app.control.inspect(timeout=2.0)
        active = i.active() or {}
        worker_names = list(active.keys())
        return {
            "available": len(worker_names) > 0,
            "workers": worker_names,
            "worker_count": len(worker_names),
        }
    except Exception as exc:
        logger.warning("workers.inspect.failed", error=str(exc))
        return {"available": False, "workers": [], "reason": str(exc)}


@app.get("/personas")
async def list_personas(request: Request, response: Response):
    data = {"personas": PersonaManager.list_all()}

    # /personas is static — ETag is computed once and stored in Redis
    r = _get_redis()
    cache_key = "etag:personas"
    etag = r.get(cache_key) if r else None
    if not etag:
        etag = _make_etag(data)
        if r:
            r.set(cache_key, etag, ex=86400)  # 24 h TTL — personas rarely change

    if _check_etag(request, etag):
        return Response(status_code=304)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=3600"
    return data


# ── Celery task polling ────────────────────────────────────────────────────────
@app.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str, request: Request, current_user: CurrentUser, db: DB
):
    if not _celery_available:
        raise HTTPException(status_code=503, detail="Async tasks not available")

    from celery.result import AsyncResult
    result = AsyncResult(task_id, app=celery_app)
    state = result.state
    meta = result.info if isinstance(result.info, dict) else {}

    progress_map = {
        "PENDING": 5, "DOWNLOADING": 20, "EXTRACTING": 50,
        "INDEXING": 80, "SUCCESS": 100, "FAILURE": 0,
    }

    resp = {
        "task_id": task_id,
        "status": state,
        "phase": meta.get("phase", state.lower()),
        "progress": progress_map.get(state, 50),
    }
    if state == "SUCCESS":
        resp["result"] = result.result
        resp["progress"] = 100
    elif state == "FAILURE":
        resp["error"] = str(result.info)
        resp["progress"] = 0

    return resp


# ── S3 presign ─────────────────────────────────────────────────────────────────
@app.post("/s3/presign")
@limiter.limit("10/minute")
async def s3_presign(
    data: S3PresignRequest, request: Request, current_user: CurrentUser, db: DB
):
    if not Config.S3_ENABLED:
        raise HTTPException(status_code=404, detail="S3 uploads not enabled")

    import boto3
    from werkzeug.utils import secure_filename

    user_id = current_user.id
    key = f"uploads/{user_id}/{uuid.uuid4()}_{secure_filename(data.fileName)}"

    s3_client = boto3.client(
        "s3",
        aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
        region_name=Config.AWS_S3_REGION,
    )
    upload_url = s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": Config.AWS_S3_BUCKET,
            "Key": key,
            "ContentType": data.contentType,
        },
        ExpiresIn=300,
    )
    file_url = f"https://{Config.AWS_S3_BUCKET}.s3.{Config.AWS_S3_REGION}.amazonaws.com/{key}"
    return {"uploadUrl": upload_url, "key": key, "fileUrl": file_url}


# ── Sessions ───────────────────────────────────────────────────────────────────
@app.get("/sessions")
async def list_sessions(request: Request, response: Response, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession)
        .where(StudySession.user_id == current_user.id)
        .order_by(StudySession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    data = {"sessions": [s.to_dict() for s in sessions]}

    etag = _make_etag(data)
    if _check_etag(request, etag):
        return Response(status_code=304)

    # Cache ETag in Redis keyed by user (short TTL — sessions mutate frequently)
    r = _get_redis()
    if r:
        r.set(f"etag:sessions:{current_user.id}", etag, ex=30)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"
    return data


@app.post("/sessions", status_code=201)
async def create_session(data: SessionCreate, current_user: CurrentUser, db: DB):
    session = StudySession(
        user_id=current_user.id,
        title=data.title.strip() or "Untitled Session",
        persona=data.persona.strip() or "academic",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    # Invalidate sessions ETag so next GET reflects the new session
    r = _get_redis()
    if r:
        r.delete(f"etag:sessions:{current_user.id}")
    return {"session": session.to_dict()}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Eagerly load relationships for to_dict
    await db.refresh(session, ["messages", "documents"])
    return {"session": session.to_dict(include_messages=True, include_documents=True)}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Pass user_id so compound filter prevents cross-user vector orphans
    await asyncio.get_event_loop().run_in_executor(
        None, rag_service.delete_session_documents, session_id, current_user.id
    )
    await db.delete(session)
    await db.commit()
    # Invalidate sessions ETag
    r = _get_redis()
    if r:
        r.delete(f"etag:sessions:{current_user.id}")
    return {"message": "Session deleted"}


# ── Documents ──────────────────────────────────────────────────────────────────
@app.post("/sessions/{session_id}/documents", status_code=202)
@limiter.limit("20/minute")
async def index_session_document(
    session_id: str,
    data: DocumentCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    file_url = data.url
    file_name = data.name

    allowed_prefixes = ALLOWED_URL_PREFIXES
    if Config.S3_ENABLED and Config.AWS_S3_BUCKET:
        allowed_prefixes = allowed_prefixes + (
            f"https://{Config.AWS_S3_BUCKET}.s3.{Config.AWS_S3_REGION}.amazonaws.com/",
        )

    if not any(file_url.startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=400, detail="File URL origin not allowed")

    # Async path: dispatch Celery task
    if _celery_available:
        from tasks.document_tasks import index_document_task
        task = index_document_task.delay(session_id, current_user.id, file_url, file_name)
        logger.info("document.task.dispatched", task_id=task.id, session_id=session_id)
        return {"task_id": task.id, "status": "queued"}

    # Synchronous fallback
    import unicodedata
    from werkzeug.utils import secure_filename
    # Strip non-ASCII before handing to secure_filename to prevent ChromaDB key collisions
    safe_name = unicodedata.normalize("NFKD", file_name).encode("ascii", "ignore").decode("ascii")
    document_id = f"{session_id}_{secure_filename(safe_name)}_{datetime.now().strftime('%H%M%S')}"

    try:
        idx_result = await rag_service.index_from_url_async(
            file_url, file_name, document_id, session_id, current_user.id
        )
    except Exception as exc:
        logger.error("document.index.failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to index document: {file_name}")

    doc_record = SessionDocument(
        session_id=session_id,
        file_name=file_name,
        file_type=idx_result.get("file_type", "unknown"),
        file_url=file_url,
        chroma_document_id=document_id,
        chunk_count=idx_result.get("chunk_count", 0),
        page_count=idx_result.get("page_count", 0),
    )
    db.add(doc_record)
    await db.commit()
    await db.refresh(doc_record)

    return {"message": "Document indexed", "document": doc_record.to_dict()}


# ── Messages (SSE streaming) ───────────────────────────────────────────────────
@app.post("/sessions/{session_id}/messages")
@limiter.limit("20/minute")
async def send_session_message(
    session_id: str,
    data: ChatMessageCreate,
    request: Request,
    current_user: CurrentUser,
    db: DB,
):
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

    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=question)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # Build chat history
    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .limit(20)
    )
    recent_msgs = msgs_result.scalars().all()
    chat_history = [{"role": m.role, "content": m.content} for m in recent_msgs[:-1]]

    # Memory context
    memory_context = ""
    preference_context = ""
    try:
        loop = asyncio.get_event_loop()
        memories = await loop.run_in_executor(
            None, memory_service.retrieve_relevant_memory, current_user.id, question, 3
        )
        if memories:
            memory_context = " | ".join(memories[:3])
        preference_context = await loop.run_in_executor(
            None, memory_service.get_user_preferences, current_user.id
        )
    except Exception as exc:
        logger.warning("memory.retrieval.failed", error=str(exc))

    model_override = custom_model or (AIService.RESPONSE_MODEL if deep_think else None)

    async def generate_response():
        loop = asyncio.get_event_loop()
        try:
            ai_result = await loop.run_in_executor(
                None,
                lambda: ai_service.answer_with_tools(
                    question=question,
                    chat_history=chat_history,
                    tool_executor=tool_executor,
                    session_id=session_id,
                    user_id=current_user.id,
                    persona=session.persona or "academic",
                    file_type="pdf",
                    model_override=model_override,
                    memory_context=memory_context,
                    preference_context=preference_context,
                ),
            )
        except Exception as exc:
            logger.error("ai.failed", error=str(exc))
            yield f"data: {json.dumps({'error': 'AI response failed'})}\n\n"
            return

        answer = ai_result.get("answer", "")
        sources = ai_result.get("sources", [])
        artifacts = ai_result.get("artifacts", [])
        suggestions = ai_result.get("suggestions", [])

        # ── Content extraction ────────────────────────────────────────────────────
        # The agentic loop returns tools' raw outputs as artifacts (with `instruction`
        # and `context`), then the model generates the actual card/question JSON in
        # its answer text. Parse that JSON out and inject it as `content` so the
        # frontend FlashcardComponent / QuizCard can render it.
        _json_array_patterns = [
            r'\[[\s\S]*?\]',  # bare JSON array
        ]
        if artifacts:
            for art in artifacts:
                if art.get("artifact_type") in ("flashcards", "quiz") and not art.get("content"):
                    raw_answer = answer
                    # Try to find the outermost JSON array in the answer
                    import re as _re
                    # Walk through all [...] spans and try to parse the longest valid one
                    parsed_content = None
                    for m in _re.finditer(r'\[', raw_answer):
                        start = m.start()
                        depth = 0
                        for i, ch in enumerate(raw_answer[start:], start=start):
                            if ch == '[':
                                depth += 1
                            elif ch == ']':
                                depth -= 1
                                if depth == 0:
                                    candidate = raw_answer[start:i + 1]
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
                        logger.info(
                            f"artifact.content.injected type={art['artifact_type']} "
                            f"items={len(parsed_content)} session={session_id}"
                        )
                    else:
                        logger.warning(
                            f"artifact.content.missing type={art['artifact_type']} "
                            f"answer_len={len(answer)} session={session_id}"
                        )


        # Save assistant message
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

        # Enrich artifacts with message_id and session_id so the frontend
        # can persist flash-card progress even before the done event arrives.
        for artifact in artifacts:
            artifact["message_id"] = assistant_msg.id
            artifact["session_id"] = session_id

        # Emit artifacts as an early dedicated event so they are not lost
        # if the client disconnects before the final done frame.
        if artifacts:
            yield f"data: {json.dumps({'artifacts': artifacts, 'message_id': assistant_msg.id})}\n\n"
            await asyncio.sleep(0)

        # Stream answer in 50-char chunks
        for i in range(0, len(answer), 50):
            yield f"data: {json.dumps({'chunk': answer[i:i+50]})}\n\n"
            await asyncio.sleep(0)

        # Final done event with metadata
        yield f"data: {json.dumps({'done': True, 'answer': answer, 'message_id': assistant_msg.id, 'sources': sources, 'artifacts': artifacts, 'suggestions': suggestions})}\n\n"

    return StreamingResponse(generate_response(), media_type="text/event-stream")


# ── Feedback ───────────────────────────────────────────────────────────────────
@app.post("/messages/{message_id}/feedback")
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
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                memory_service.store_interaction,
                current_user.id,
                user_msg.content,
                msg.content[:300],
                data.feedback,
            )
    except Exception as exc:
        logger.warning("memory.feedback.failed", error=str(exc))

    return {"message": "Feedback recorded"}


# ── Flashcard progress ─────────────────────────────────────────────────────────
@app.post("/flashcards/progress")
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


@app.get("/flashcards/progress/{session_id}/{message_id}")
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


@app.get("/flashcards/due")
async def get_due_flashcards(current_user: CurrentUser, db: DB):
    """Return all flashcards due for review today (SM-2 next_review_date <= now)."""
    today = datetime.utcnow()

    # Get all sessions for this user
    sess_result = await db.execute(
        select(StudySession.id).where(StudySession.user_id == current_user.id)
    )
    session_ids = [row[0] for row in sess_result.fetchall()]
    if not session_ids:
        return {"due": [], "total": 0}

    # Fetch due cards
    due_result = await db.execute(
        select(FlashcardProgress)
        .where(
            FlashcardProgress.session_id.in_(session_ids),
            FlashcardProgress.next_review_date <= today,
        )
        .order_by(FlashcardProgress.next_review_date)
    )
    due_records = due_result.scalars().all()

    # Enrich each card with its back text from the originating message artifact
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
                        import json as _json
                        cards_data = _json.loads(cards_data)
                    if isinstance(cards_data, dict):
                        cards_data = cards_data.get("cards", [])
                    if isinstance(cards_data, list) and len(cards_data) > rec.card_index:
                        card = cards_data[rec.card_index]
                        card_back = card.get("back") or card.get("answer") or card.get("definition")
                    break
        except Exception as exc:
            logger.warning(f"flashcards.due.enrich.failed card={rec.id}: {exc}")

        row = rec.to_dict()
        row["card_back"] = card_back
        enriched.append(row)

    return {"due": enriched, "total": len(enriched)}


# ── Flashcard & Quiz direct-generate (migrated from Flask app.py) ─────────────
@app.post("/flashcards/generate")
@limiter.limit("10/minute")
async def generate_flashcards_direct(
    request: Request, current_user: CurrentUser, db: DB
):
    """Generate flashcards directly from session documents, bypassing the agentic loop.

    Body: { session_id, topic (optional), num_cards (optional, default 8) }
    """
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


@app.post("/quiz/generate")
@limiter.limit("10/minute")
async def generate_quiz_direct(
    request: Request, current_user: CurrentUser, db: DB
):
    """Generate a quiz directly from session documents (bypasses agentic loop)."""
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


# ── Session activity feed ──────────────────────────────────────────────────────
@app.get("/sessions/{session_id}/activity")
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

    # Recent messages (ai exchanges only)
    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.role == "assistant")
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    messages = msgs_result.scalars().all()

    # Quiz results for session
    quiz_res = await db.execute(
        select(QuizResult).where(QuizResult.session_id == session_id).order_by(QuizResult.created_at.desc())
    )
    quizzes = quiz_res.scalars().all()

    # Flashcard progress for session
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


# ── Flashcard mastery summary (for Heatmap) ────────────────────────────────────
@app.get("/flashcards/progress/summary/{session_id}")
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

    # Group by message_id
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


# ── Quiz results ───────────────────────────────────────────────────────────────
@app.post("/quiz/results")
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


# ── Analytics ──────────────────────────────────────────────────────────────────
@app.get("/analytics/summary")
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


# ── Transcription ──────────────────────────────────────────────────────────────
@app.post("/transcribe")
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request, file: UploadFile, current_user: CurrentUser, db: DB
):
    filename = file.filename or ""
    ext = os.path.splitext(filename.lower())[1]
    if ext not in Config.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(Config.ALLOWED_AUDIO_EXTENSIONS)}",
        )

    openai_client = ai_service.client
    if not openai_client:
        raise HTTPException(
            status_code=503, detail="Transcription requires OPENAI_API_KEY to be set"
        )

    from werkzeug.utils import secure_filename
    safe_name = secure_filename(filename)
    filepath = os.path.join(
        UPLOAD_FOLDER, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe_name}"
    )
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        with open(filepath, "rb") as audio_file:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1", file=audio_file, response_format="text"
            )
        return {"transcript": transcript}
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass


# ── Legacy upload endpoint ─────────────────────────────────────────────────────
@app.post("/upload")
@limiter.limit("20/minute")
async def upload_file(request: Request, current_user: CurrentUser, db: DB):
    """Legacy multipart upload endpoint (kept for backward compat)."""
    import requests as http_requests
    from langchain_core.documents import Document as LCDocument
    from werkzeug.utils import secure_filename

    form = await request.form()
    file_count = int(form.get("fileCount", "1"))
    files = []
    for i in range(file_count):
        f = form.get(f"file_{i}") or (form.get("file") if i == 0 else None) or (
            form.get("pdf") if i == 0 else None
        )
        if f:
            files.append(f)

    if not files:
        raise HTTPException(status_code=400, detail="No file provided")

    question = (form.get("question", "") or "").strip()
    is_valid, error_msg = InputValidator.validate_question(question)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    chat_history_str = form.get("chatHistory", "[]")
    try:
        chat_history = json.loads(chat_history_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid chat history format")

    deep_think = (form.get("deepThink", "") or "").lower() == "true"
    n_chunks = Config.DEEP_THINK_CHUNKS if deep_think else Config.NUM_RETRIEVAL_CHUNKS
    model_override = AIService.RESPONSE_MODEL if deep_think else None
    persona = (form.get("persona", "") or "").strip() or "academic"

    all_chunks_with_pages = []
    all_file_infos = []
    filepaths = []
    image_filepaths = []
    combined_text = ""
    primary_file_type = "pdf"

    for f in files:
        filename = secure_filename(f.filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, safe_filename)
        filepaths.append(filepath)

        content = await f.read()
        with open(filepath, "wb") as fout:
            fout.write(content)

        file_type = file_service.detect_file_type(filepath)
        if primary_file_type == "pdf":
            primary_file_type = file_type
        if file_type == "image":
            image_filepaths.append(filepath)

        file_info = file_service.get_file_info(filepath)
        if file_info:
            file_info["file_type"] = file_type
            all_file_infos.append(file_info)

        page_texts = file_service.extract_text_universal(filepath)
        if not page_texts:
            continue

        extracted_text = "\n\n".join(p["text"] for p in page_texts)
        combined_text += extracted_text + "\n\n"

        document_id = safe_filename
        chunks_with_pages = file_service.chunking_function_with_pages(page_texts)
        if chunks_with_pages:
            docs = [
                LCDocument(
                    page_content=c["text"],
                    metadata={"document_id": document_id, "pages": json.dumps(c["pages"])},
                )
                for c in chunks_with_pages
            ]
            ids = [f"{document_id}_chunk_{i}" for i in range(len(docs))]
            rag_service.vectorstore.add_documents(docs, ids=ids)
            all_chunks_with_pages.extend([(document_id, c) for c in chunks_with_pages])

    if not all_chunks_with_pages:
        raise HTTPException(status_code=500, detail="Failed to extract text from uploaded file(s)")

    relevant_chunks = []
    relevant_metas = []
    try:
        results = rag_service.vectorstore.similarity_search(
            query=question, k=min(n_chunks, max(1, len(all_chunks_with_pages)))
        )
        relevant_chunks = [doc.page_content for doc in results]
        relevant_metas = [doc.metadata for doc in results]
    except Exception as exc:
        logger.warning("chromadb.query.failed", error=str(exc))

    for doc_id, _ in all_chunks_with_pages:
        try:
            rag_service.collection.delete(where={"document_id": doc_id})
        except Exception:
            pass

    ai_response = ai_service.answer_from_context(
        relevant_chunks, question, chat_history,
        model_override=model_override, persona=persona,
        file_type=primary_file_type, image_paths=image_filepaths or None,
    )
    if not ai_response:
        raise HTTPException(status_code=500, detail="Failed to generate AI response")

    for filepath in filepaths:
        try:
            os.remove(filepath)
        except Exception:
            pass

    sources = rag_service.build_sources(relevant_chunks, relevant_metas)
    return {
        "message": "Document processed successfully",
        "text": combined_text.strip(),
        "answer": ai_response,
        "file_info": all_file_infos[0] if all_file_infos else {},
        "file_infos": all_file_infos,
        "sources": sources,
    }


# ── Legacy ask endpoint ────────────────────────────────────────────────────────
@app.post("/ask")
@limiter.limit("20/minute")
async def ask(request: Request, current_user: CurrentUser, db: DB):
    """Legacy ask endpoint: file URLs + question → RAG pipeline."""
    import requests as http_requests
    from langchain_core.documents import Document as LCDocument
    from werkzeug.utils import secure_filename

    data = await request.json()
    file_urls = data.get("fileUrls", [])
    if not isinstance(file_urls, list) or not file_urls:
        raise HTTPException(status_code=400, detail="fileUrls array is required")

    question = (data.get("question") or "").strip()
    is_valid, error_msg = InputValidator.validate_question(question)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    chat_history = data.get("chatHistory", [])
    deep_think = bool(data.get("deepThink", False))
    n_chunks = Config.DEEP_THINK_CHUNKS if deep_think else Config.NUM_RETRIEVAL_CHUNKS
    model_override = AIService.RESPONSE_MODEL if deep_think else None
    persona = (data.get("persona") or "").strip() or "academic"

    all_chunks_with_pages = []
    all_file_infos = []
    filepaths = []
    image_filepaths = []
    combined_text = ""
    primary_file_type = "pdf"

    for entry in file_urls:
        url = entry.get("url", "") if isinstance(entry, dict) else str(entry)
        name = entry.get("name", "file") if isinstance(entry, dict) else "file"

        if not any(url.startswith(prefix) for prefix in ALLOWED_URL_PREFIXES):
            raise HTTPException(status_code=400, detail=f"File URL origin not allowed: {url}")

        try:
            dl_resp = http_requests.get(url, timeout=30, stream=True)
            dl_resp.raise_for_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to download file: {name}")

        filename = secure_filename(name) or "file"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, safe_filename)
        filepaths.append(filepath)

        with open(filepath, "wb") as fout:
            for chunk in dl_resp.iter_content(chunk_size=8192):
                fout.write(chunk)

        file_type = file_service.detect_file_type(filepath)
        if primary_file_type == "pdf":
            primary_file_type = file_type
        if file_type == "image":
            image_filepaths.append(filepath)

        file_info = file_service.get_file_info(filepath)
        if file_info:
            file_info["file_type"] = file_type
            all_file_infos.append(file_info)

        page_texts = file_service.extract_text_universal(filepath)
        if not page_texts:
            continue

        extracted_text = "\n\n".join(p["text"] for p in page_texts)
        combined_text += extracted_text + "\n\n"

        document_id = safe_filename
        chunks_with_pages = file_service.chunking_function_with_pages(page_texts)
        if chunks_with_pages:
            docs = [
                LCDocument(
                    page_content=c["text"],
                    metadata={"document_id": document_id, "pages": json.dumps(c["pages"])},
                )
                for c in chunks_with_pages
            ]
            ids = [f"{document_id}_chunk_{i}" for i in range(len(docs))]
            rag_service.vectorstore.add_documents(docs, ids=ids)
            all_chunks_with_pages.extend([(document_id, c) for c in chunks_with_pages])

    if not all_chunks_with_pages:
        raise HTTPException(status_code=500, detail="Failed to extract text from uploaded file(s)")

    relevant_chunks = []
    relevant_metas = []
    try:
        results = rag_service.vectorstore.similarity_search(
            query=question, k=min(n_chunks, max(1, len(all_chunks_with_pages)))
        )
        relevant_chunks = [doc.page_content for doc in results]
        relevant_metas = [doc.metadata for doc in results]
    except Exception as exc:
        logger.warning("chromadb.query.failed", error=str(exc))

    for doc_id, _ in all_chunks_with_pages:
        try:
            rag_service.collection.delete(where={"document_id": doc_id})
        except Exception:
            pass

    ai_response = ai_service.answer_from_context(
        relevant_chunks, question, chat_history,
        model_override=model_override, persona=persona,
        file_type=primary_file_type, image_paths=image_filepaths or None,
    )
    if not ai_response:
        raise HTTPException(status_code=500, detail="Failed to generate AI response")

    for filepath in filepaths:
        try:
            os.remove(filepath)
        except Exception:
            pass

    sources = rag_service.build_sources(relevant_chunks, relevant_metas)
    return {
        "message": "Document processed successfully",
        "text": combined_text.strip(),
        "answer": ai_response,
        "file_info": all_file_infos[0] if all_file_infos else {},
        "file_infos": all_file_infos,
        "sources": sources,
    }


# ── TTS ────────────────────────────────────────────────────────────────────────
@app.post("/tts")
@limiter.limit("10/minute")
async def text_to_speech(
    data: TTSRequest, request: Request, current_user: CurrentUser, db: DB
):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="Text too long (max 4096 characters)")

    tts_client = ai_service.client
    if not tts_client:
        raise HTTPException(
            status_code=503, detail="TTS requires OPENAI_API_KEY to be set"
        )

    voice = PersonaManager.voice_for(data.persona)
    tts_response = tts_client.audio.speech.create(model="tts-1", voice=voice, input=text)
    return Response(content=tts_response.content, media_type="audio/mpeg")


# ── Export endpoints ───────────────────────────────────────────────────────────
@app.post("/export/notion")
async def export_to_notion(
    data: NotionExportRequest, request: Request, current_user: CurrentUser, db: DB
):
    import requests as http_requests

    notion_token = request.headers.get("X-Notion-Token", "")
    if not notion_token:
        raise HTTPException(status_code=400, detail="Notion integration token required")
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")

    search_resp = http_requests.post(
        "https://api.notion.com/v1/search",
        headers={
            "Authorization": f"Bearer {notion_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        json={"query": "", "page_size": 1},
        timeout=10,
    )
    if search_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to connect to Notion. Check your token.")

    results = search_resp.json().get("results", [])
    parent_id = results[0]["id"] if results else None
    if not parent_id:
        raise HTTPException(
            status_code=400,
            detail="No pages found in Notion workspace. Create a page first.",
        )

    blocks = []
    for i in range(0, len(data.content), 2000):
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": data.content[i:i + 2000]}}]
            },
        })

    create_resp = http_requests.post(
        "https://api.notion.com/v1/pages",
        headers={
            "Authorization": f"Bearer {notion_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        json={
            "parent": {"page_id": parent_id},
            "properties": {"title": [{"text": {"content": data.title}}]},
            "children": blocks[:100],
        },
        timeout=15,
    )
    if create_resp.status_code in (200, 201):
        page_url = create_resp.json().get("url", "")
        return {"message": "Exported to Notion", "url": page_url}
    raise HTTPException(status_code=500, detail="Failed to create Notion page")


@app.post("/export/markdown")
async def export_markdown(data: ExportRequest, current_user: CurrentUser, db: DB):
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")
    md_content = f"# {data.title}\n\n{data.content}\n"
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{data.title}.md"'},
    )


@app.post("/export/enex")
async def export_enex(data: ExportRequest, current_user: CurrentUser, db: DB):
    if not data.content:
        raise HTTPException(status_code=400, detail="Content is required")

    from xml.sax.saxutils import escape

    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    html_content = data.content.replace("\n", "<br/>")
    enex = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="{now}" application="FileGeek">
  <note>
    <title>{escape(data.title)}</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>{escape(html_content)}</en-note>]]></content>
    <created>{now}</created>
  </note>
</en-export>"""
    return Response(
        content=enex,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{data.title}.enex"'},
    )


# ── Entrypoint ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    has_gemini = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    has_openai = os.getenv("OPENAI_API_KEY")
    if not has_gemini and not has_openai:
        raise SystemExit("Set GOOGLE_API_KEY (Gemini) or OPENAI_API_KEY to start the server")

    logger.info(f"Starting FileGeek FastAPI server on port {Config.PORT}...")
    uvicorn.run(
        "main:app",
        host=Config.HOST,
        port=Config.PORT,
        reload=False,
    )
