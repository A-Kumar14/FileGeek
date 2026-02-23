import os
import re
import json
import uuid
from functools import wraps
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

import jwt as pyjwt
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.utils import secure_filename

from config import Config
from models import db, User, StudySession, ChatMessage, SessionDocument
from auth import auth_bp, JWT_SECRET
from services.ai_service import AIService
from services.file_service import FileService
from services.rag_service import RAGService, MemoryService
from services.tools import ToolExecutor
from logging_config import get_logger
from utils.validators import InputValidator, check_prompt_injection

# ---------------------------------------------------------
# Structured logging
# ---------------------------------------------------------
logger = get_logger(__name__)


# ---------------------------------------------------------
# Flask app setup
# ---------------------------------------------------------
app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///users.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

from sqlalchemy.exc import OperationalError

# Initialize DB safe for multiple workers
with app.app_context():
    try:
        db.create_all()
    except OperationalError as e:
        # handling race condition for sqlite/postgres table creation
        err_msg = str(e).lower()
        if "already exists" in err_msg or "table" in err_msg and "exists" in err_msg:
            pass
        else:
            logger.warning("db.create_all.error", error=str(e))
    except Exception as e:
         logger.warning("db.create_all.unexpected_error", error=str(e))

CORS(
    app,
    origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://file-geek.vercel.app",
        re.compile(r"https://.*\.vercel\.app"),
        re.compile(r"https://.*\.onrender\.com"),
    ],
    supports_credentials=True,
)

app.register_blueprint(auth_bp, url_prefix="/auth")

# ---------------------------------------------------------
# Flask-Limiter (distributed via Redis, falls back to memory)
# ---------------------------------------------------------
def _get_limiter_storage_uri():
    """Use Redis if reachable, otherwise fall back to in-memory storage."""
    uri = Config.RATELIMIT_STORAGE_URI
    if uri and uri.startswith("redis"):
        try:
            import redis as _redis
            r = _redis.from_url(uri, socket_connect_timeout=1)
            r.ping()
            return uri
        except Exception:
            logger.warning("limiter.redis.unavailable", msg="Falling back to in-memory rate limiting")
    return "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    storage_uri=_get_limiter_storage_uri(),
    default_limits=[Config.RATELIMIT_DEFAULT],
    strategy="fixed-window",
)

# ---------------------------------------------------------
# Celery (optional — graceful fallback if Redis unavailable)
# ---------------------------------------------------------
_celery_available = False
try:
    from celery_app import celery_app, init_celery
    init_celery(app)
    _celery_available = True
    logger.info("celery.initialized")
except Exception as e:
    logger.warning("celery.unavailable", error=str(e))

# ---------------------------------------------------------
# Services
# ---------------------------------------------------------
ai_service = AIService()
file_service = FileService()
rag_service = RAGService(ai_service, file_service)
memory_service = MemoryService(ai_service)
tool_executor = ToolExecutor(rag_service, ai_service)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER
MAX_CONTENT_LENGTH = Config.MAX_CONTENT_LENGTH
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ---------------------------------------------------------
# JWT decorator
# ---------------------------------------------------------
def jwt_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid authorization token"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            request.jwt_payload = payload
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


def _get_user_id():
    return request.jwt_payload.get("user_id")


# ---------------------------------------------------------
# Middleware — structured request logging (rate limiting is now Flask-Limiter)
# ---------------------------------------------------------
@app.before_request
def before_request():
    """Log all requests."""
    client_ip = request.remote_addr or "unknown"
    logger.info("request.received", ip=client_ip, method=request.method, path=request.path)


# ---------------------------------------------------------
# Routes — Health & Personas
# ---------------------------------------------------------
@app.route("/health", methods=["GET"])
@limiter.exempt
def health_check():
    return (
        jsonify(
            {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "version": "4.0.0",
                "celery_available": _celery_available,
            }
        ),
        200,
    )


# =========================================================
# CELERY TASK POLLING
# =========================================================

@app.route("/tasks/<task_id>", methods=["GET"])
@jwt_required
def get_task_status(task_id):
    """Poll a Celery task by ID. Returns status, phase, progress, and result."""
    if not _celery_available:
        return jsonify({"error": "Async tasks not available"}), 503

    from celery.result import AsyncResult
    result = AsyncResult(task_id, app=celery_app)

    state = result.state
    meta = result.info if isinstance(result.info, dict) else {}

    # Map Celery states to progress
    progress_map = {
        "PENDING": 5,
        "DOWNLOADING": 20,
        "EXTRACTING": 50,
        "INDEXING": 80,
        "SUCCESS": 100,
        "FAILURE": 0,
    }

    response = {
        "task_id": task_id,
        "status": state,
        "phase": meta.get("phase", state.lower()),
        "progress": progress_map.get(state, 50),
    }

    if state == "SUCCESS":
        response["result"] = result.result
        response["progress"] = 100
    elif state == "FAILURE":
        response["error"] = str(result.info)
        response["progress"] = 0

    return jsonify(response), 200


# =========================================================
# S3 PRESIGNED URL
# =========================================================

@app.route("/s3/presign", methods=["POST"])
@jwt_required
@limiter.limit("10/minute")
def s3_presign():
    """Generate a presigned S3 PUT URL for direct upload."""
    if not Config.S3_ENABLED:
        return jsonify({"error": "S3 uploads not enabled"}), 404

    import boto3

    data = request.get_json(silent=True) or {}
    file_name = data.get("fileName", "file")
    content_type = data.get("contentType", "application/octet-stream")
    user_id = _get_user_id()

    key = f"uploads/{user_id}/{uuid.uuid4()}_{secure_filename(file_name)}"

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
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )

    file_url = f"https://{Config.AWS_S3_BUCKET}.s3.{Config.AWS_S3_REGION}.amazonaws.com/{key}"

    return jsonify({"uploadUrl": upload_url, "key": key, "fileUrl": file_url}), 200

def sanitize_model(model_str: str) -> str:
    """Normalize and map UI model strings to core internal SDK identifiers."""
    if not model_str:
        return None
    mapping = {
        "gpt-4o": "gpt-4o",
        "gpt-4o-mini": "gpt-4o-mini",
        "gemini-2.0-flash": "gemini-2.0-flash",
        "gemini-2.5-pro": "gemini-1.5-pro",  # fallback if 2.5 is UI placeholder
    }
    return mapping.get(model_str.lower(), model_str)


# =========================================================
# SESSION ENDPOINTS
# =========================================================

@app.route("/sessions", methods=["GET"])
@jwt_required
def list_sessions():
    """List user's study sessions."""
    user_id = _get_user_id()
    sessions = StudySession.query.filter_by(user_id=user_id).order_by(
        StudySession.updated_at.desc()
    ).limit(50).all()
    return jsonify({"sessions": [s.to_dict() for s in sessions]}), 200


@app.route("/sessions", methods=["POST"])
@jwt_required
def create_session():
    """Create a new study session."""
    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip() or "Untitled Session"

    session = StudySession(user_id=user_id, title=title)
    db.session.add(session)
    db.session.commit()

    return jsonify({"session": session.to_dict()}), 201


@app.route("/sessions/<session_id>", methods=["GET"])
@jwt_required
def get_session(session_id):
    """Get session with messages and documents."""
    user_id = _get_user_id()
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found"}), 404
    return jsonify({"session": session.to_dict(include_messages=True, include_documents=True)}), 200


@app.route("/sessions/<session_id>", methods=["DELETE"])
@jwt_required
def delete_session(session_id):
    """Delete session and cleanup ChromaDB."""
    user_id = _get_user_id()
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found"}), 404

    rag_service.delete_session_documents(session_id)
    db.session.delete(session)
    db.session.commit()

    return jsonify({"message": "Session deleted"}), 200


@app.route("/sessions/<session_id>/documents", methods=["POST"])
@jwt_required
@limiter.limit("20/minute")
def index_session_document(session_id):
    """Index a document into a session's RAG collection.

    If Celery is available, dispatches async and returns 202 with task_id.
    Otherwise falls back to synchronous indexing.
    """
    user_id = _get_user_id()
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found"}), 404

    data = request.get_json(silent=True) or {}
    file_url = data.get("url", "")
    file_name = data.get("name", "document")

    if not file_url:
        return jsonify({"error": "File URL is required"}), 400

    # Validate URL origin
    allowed_prefixes = (
        "https://utfs.io/",
        "https://uploadthing.com/",
        "https://ufs.sh/",
        "https://4k40e5rcbl.ufs.sh/",
    )
    # Also allow S3 URLs if S3 is enabled
    if Config.S3_ENABLED and Config.AWS_S3_BUCKET:
        allowed_prefixes = allowed_prefixes + (
            f"https://{Config.AWS_S3_BUCKET}.s3.{Config.AWS_S3_REGION}.amazonaws.com/",
        )

    if not any(file_url.startswith(p) for p in allowed_prefixes):
        return jsonify({"error": "File URL origin not allowed"}), 400

    # Async path: dispatch Celery task
    if _celery_available:
        from tasks.document_tasks import index_document_task
        task = index_document_task.delay(session_id, user_id, file_url, file_name)
        logger.info("document.task.dispatched", task_id=task.id, session_id=session_id)
        return jsonify({"task_id": task.id, "status": "queued"}), 202

    # Synchronous fallback (dev without Redis)
    document_id = f"{session_id}_{secure_filename(file_name)}_{datetime.now().strftime('%H%M%S')}"

    try:
        result = rag_service.index_from_url(file_url, file_name, document_id, session_id, user_id)
    except Exception as e:
        logger.error("document.index.failed", error=str(e))
        return jsonify({"error": f"Failed to index document: {file_name}"}), 500

    doc_record = SessionDocument(
        session_id=session_id,
        file_name=file_name,
        file_type=result.get("file_type", "unknown"),
        file_url=file_url,
        chroma_document_id=document_id,
        chunk_count=result.get("chunk_count", 0),
        page_count=result.get("page_count", 0),
    )
    db.session.add(doc_record)
    db.session.commit()

    return jsonify({
        "message": "Document indexed",
        "document": doc_record.to_dict(),
    }), 201


@app.route("/sessions/<session_id>/messages", methods=["POST"])
@jwt_required
@limiter.limit("20/minute")
def send_session_message(session_id):
    """Send a message in a session — uses agentic RAG pipeline.

    If request body contains async=true and Celery is available,
    dispatches async and returns 202. Otherwise runs synchronously.
    """
    user_id = _get_user_id()
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found"}), 404

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    is_valid, error_msg = InputValidator.validate_question(question)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Prompt injection detection (defense-in-depth, logs warning only)
    if check_prompt_injection(question):
        logger.warning("prompt_injection.detected", question_prefix=question[:80], session_id=session_id)

    deep_think = bool(data.get("deepThink", False))
    use_async = bool(data.get("async", False))
    custom_model = sanitize_model(data.get("model"))  # Optional model selection from frontend

    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=question)
    db.session.add(user_msg)
    db.session.commit()

    # Async path
    if use_async and _celery_available:
        from tasks.message_tasks import send_message_task
        task = send_message_task.delay(session_id, user_id, question, deep_think)
        logger.info("message.task.dispatched", task_id=task.id, session_id=session_id)
        return jsonify({"task_id": task.id, "status": "queued", "user_message_id": user_msg.id}), 202

    # Synchronous path - prioritize custom model, then deep think model, then default
    model_override = custom_model or (AIService.RESPONSE_MODEL if deep_think else None)

    # Build chat history from DB
    recent_msgs = ChatMessage.query.filter_by(session_id=session_id).order_by(
        ChatMessage.created_at
    ).limit(20).all()
    chat_history = [{"role": m.role, "content": m.content} for m in recent_msgs[:-1]]

    # Memory context
    memory_context = ""
    preference_context = ""
    try:
        memories = memory_service.retrieve_relevant_memory(user_id, question, n=3)
        if memories:
            memory_context = " | ".join(memories[:3])
        preference_context = memory_service.get_user_preferences(user_id)
    except Exception as e:
        logger.warning("memory.retrieval.failed", error=str(e))

    # Agentic RAG pipeline
    try:
        result = ai_service.answer_with_tools(
            question=question,
            chat_history=chat_history,
            tool_executor=tool_executor,
            session_id=session_id,
            user_id=user_id,
            file_type="pdf",
            model_override=model_override,
            memory_context=memory_context,
            preference_context=preference_context,
        )
        answer = result.get("answer", "")
        sources = result.get("sources", [])
        artifacts = result.get("artifacts", [])
        suggestions = result.get("suggestions", [])
        tool_calls = result.get("tool_calls", [])
    except Exception as pipeline_err:
        import traceback
        logger.error(
            "session.message.pipeline.failed",
            session_id=session_id,
            error=str(pipeline_err),
            traceback=traceback.format_exc(),
        )
        answer = (
            "⚠️ An internal error occurred while processing your request. "
            "The document may need to be re-uploaded. Please try again."
        )
        sources, artifacts, suggestions, tool_calls = [], [], [], []

    # Save assistant message
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=answer,
        sources_json=json.dumps(sources),
        artifacts_json=json.dumps(artifacts),
        suggestions_json=json.dumps(suggestions),
        tool_calls_json=json.dumps(tool_calls),
    )
    db.session.add(assistant_msg)

    # Update session timestamp
    session.updated_at = datetime.utcnow()
    db.session.commit()

    # Enrich artifacts with message_id for frontend tracking
    for artifact in artifacts:
        artifact["message_id"] = assistant_msg.id

    return jsonify({
        "message_id": assistant_msg.id,
        "answer": answer,
        "sources": sources,
        "artifacts": artifacts,
        "suggestions": suggestions,
    }), 200



@app.route("/messages/<int:message_id>/feedback", methods=["POST"])
@jwt_required
def message_feedback(message_id):
    """Thumbs up/down on a message."""
    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}
    feedback = data.get("feedback", "")

    if feedback not in ("up", "down"):
        return jsonify({"error": "Feedback must be 'up' or 'down'"}), 400

    msg = ChatMessage.query.get(message_id)
    if not msg:
        return jsonify({"error": "Message not found"}), 404

    # Verify ownership
    session = StudySession.query.filter_by(id=msg.session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Not authorized"}), 403

    msg.feedback = feedback
    db.session.commit()

    # Store in long-term memory
    try:
        # Find the user question that preceded this assistant message
        user_msg = ChatMessage.query.filter(
            ChatMessage.session_id == msg.session_id,
            ChatMessage.role == "user",
            ChatMessage.id < msg.id,
        ).order_by(ChatMessage.id.desc()).first()

        if user_msg:
            memory_service.store_interaction(
                user_id,
                user_msg.content,
                msg.content[:300],
                feedback,
            )
    except Exception as e:
        logger.warning("memory.feedback.failed", error=str(e))

    return jsonify({"message": "Feedback recorded"}), 200


# =========================================================
# FLASHCARD PROGRESS
# =========================================================

@app.route("/flashcards/progress", methods=["POST"])
@jwt_required
def save_flashcard_progress():
    """Save flashcard review progress for spaced repetition."""
    from models import FlashcardProgress
    from datetime import timedelta

    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")
    message_id = data.get("message_id")
    card_index = data.get("card_index")
    card_front = data.get("card_front", "")
    status = data.get("status", "remaining")  # remaining | reviewing | known

    if not all([session_id, message_id is not None, card_index is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    if status not in ("remaining", "reviewing", "known"):
        return jsonify({"error": "Invalid status"}), 400

    # Verify session ownership
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Not authorized"}), 403

    # Find or create progress record
    progress = FlashcardProgress.query.filter_by(
        session_id=session_id,
        message_id=message_id,
        card_index=card_index
    ).first()

    if not progress:
        progress = FlashcardProgress(
            session_id=session_id,
            message_id=message_id,
            card_index=card_index,
            card_front=card_front[:255],  # Truncate to fit column
        )
        db.session.add(progress)

    # Update status and SM-2 algorithm fields
    progress.status = status
    progress.review_count += 1
    progress.updated_at = datetime.utcnow()

    # Simple SM-2 spaced repetition logic
    if status == "known":
        # Increase ease and interval
        progress.ease_factor = min(progress.ease_factor + 0.1, 2.5)
        progress.interval_days = max(1, int(progress.interval_days * progress.ease_factor))
        progress.next_review_date = datetime.utcnow() + timedelta(days=progress.interval_days)
    elif status == "reviewing":
        # Maintain ease, reset to shorter interval
        progress.interval_days = 1
        progress.next_review_date = datetime.utcnow() + timedelta(days=1)
    else:  # remaining
        # Reset to initial state
        progress.ease_factor = 2.5
        progress.interval_days = 1
        progress.next_review_date = None

    db.session.commit()

    return jsonify({"message": "Progress saved", "progress": progress.to_dict()}), 200


@app.route("/flashcards/progress/<session_id>/<int:message_id>", methods=["GET"])
@jwt_required
def load_flashcard_progress(session_id, message_id):
    """Load flashcard progress for a specific session and message."""
    from models import FlashcardProgress

    user_id = _get_user_id()

    # Verify session ownership
    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Not authorized"}), 403

    # Get all progress records for this flashcard set
    progress_records = FlashcardProgress.query.filter_by(
        session_id=session_id,
        message_id=message_id
    ).order_by(FlashcardProgress.card_index).all()

    return jsonify({
        "progress": [p.to_dict() for p in progress_records]
    }), 200


@app.route("/flashcards/generate", methods=["POST"])
@jwt_required
@limiter.limit("10/minute")
def generate_flashcards_direct():
    """Generate flashcards directly from session documents.

    Bypasses the LLM agentic loop — calls the ToolExecutor's
    generate_flashcards handler directly for reliable structured output.

    Body: { session_id, topic (optional), num_cards (optional, default 8) }
    """
    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")
    topic = (data.get("topic") or "").strip() or "the document"
    num_cards = min(int(data.get("num_cards", 8)), 20)
    custom_model = sanitize_model(data.get("model"))

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found or not authorized"}), 404

    # Call the tool directly — no LLM tool-calling involved
    result = tool_executor.execute(
        "generate_flashcards",
        {"topic": topic, "num_cards": num_cards, "card_type": "mixed", "model": custom_model},
        session_id,
        user_id,
    )

    if result.get("error"):
        return jsonify({"error": result["error"]}), 500

    content = result.get("content")
    if not content:
        return jsonify({"error": "No document content found. Upload and index a document first."}), 422

    return jsonify({
        "cards": content,
        "topic": result.get("topic", topic),
        "card_type": result.get("card_type", "mixed"),
        "total": len(content),
    }), 200


@app.route("/quiz/generate", methods=["POST"])
@jwt_required
@limiter.limit("10/minute")
def generate_quiz_direct():
    """Generate a quiz directly from session documents (bypasses agentic loop)."""
    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")
    topic = (data.get("topic") or "").strip() or "the document"
    num_questions = min(int(data.get("num_cards", data.get("num_questions", 5))), 10)
    custom_model = sanitize_model(data.get("model"))

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found or not authorized"}), 404

    result = tool_executor.execute(
        "generate_quiz",
        {"topic": topic, "num_questions": num_questions, "model": custom_model},
        session_id,
        user_id,
    )

    if result.get("error"):
        return jsonify({"error": result["error"]}), 500

    content = result.get("content")
    if not content:
        return jsonify({"error": "No document content found. Upload and index a document first."}), 422

    return jsonify({
        "questions": content,
        "topic": result.get("topic", topic),
        "total": len(content),
    }), 200


@app.route("/podcast/generate", methods=["POST"])
@jwt_required
@limiter.limit("5/minute")
def generate_podcast_direct():
    """Generate a podcast script directly from session documents."""
    user_id = _get_user_id()
    data = request.get_json(silent=True) or {}

    session_id = data.get("session_id")
    topic = (data.get("topic") or "").strip() or "the entire document"
    custom_model = sanitize_model(data.get("model"))

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = StudySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found or not authorized"}), 404

    # Use RAG to fetch context
    result = rag_service.query(topic, session_id, user_id, n_results=10)
    chunks = result.get("chunks", [])
    context = "\n\n".join(chunks)

    if not context:
        return jsonify({"error": "No document content found to generate a podcast."}), 422

    instruction = f"""Write a compelling 2-person podcast script discussing the topic: '{topic}' based on the provided context.
The hosts are 'Host 1 (Curious, asks questions)' and 'Host 2 (Expert, explains concepts)'.
Include sound effects directions in brackets like [upbeat intro music].
Format the script in Markdown."""

    script = ai_service.answer_from_context(
        context_chunks=[context],
        question=instruction,
        chat_history=[],
        model_override=custom_model,
        persona="casual"
    )

    if not script:
        return jsonify({"error": "Failed to generate podcast script."}), 500

    return jsonify({
        "artifact_type": "podcast_script",
        "script": script,
        "topic": topic,
    }), 200


# =========================================================
# AUDIO TRANSCRIPTION
# =========================================================

@app.route("/transcribe", methods=["POST"])
@jwt_required
@limiter.limit("10/minute")
def transcribe_audio():
    """Transcribe audio file using OpenAI Whisper API."""
    try:
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "No audio file provided"}), 400

        filename = getattr(f, "filename", "") or ""
        ext = os.path.splitext(filename.lower())[1]
        if ext not in Config.ALLOWED_AUDIO_EXTENSIONS:
            return jsonify({"error": f"Unsupported audio format. Allowed: {', '.join(Config.ALLOWED_AUDIO_EXTENSIONS)}"}), 400

        # Need OpenAI client for Whisper
        openai_client = ai_service.client
        if not openai_client:
            return jsonify({"error": "Transcription requires OPENAI_API_KEY to be set"}), 503

        safe_filename = secure_filename(filename)
        filepath = os.path.join(UPLOAD_FOLDER, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe_filename}")
        f.save(filepath)

        try:
            with open(filepath, "rb") as audio_file:
                transcript = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text",
                )
            return jsonify({"transcript": transcript}), 200
        finally:
            try:
                os.remove(filepath)
            except Exception:
                pass

    except Exception as e:
        logger.error("transcription.failed", error=str(e))
        return jsonify({"error": "Transcription failed"}), 500


# =========================================================
# LEGACY ENDPOINTS (backward compat)
# =========================================================

ALLOWED_URL_PREFIXES = (
    "https://utfs.io/",
    "https://uploadthing.com/",
    "https://ufs.sh/",
    "https://4k40e5rcbl.ufs.sh/",
)


@app.route("/upload", methods=["POST"])
@jwt_required
@limiter.limit("20/minute")
def upload_file():
    """Handle file upload and analysis (legacy — kept for backward compat)."""

    try:
        file_count = int(request.form.get("fileCount", "1"))
        files = []
        for i in range(file_count):
            f = request.files.get(f"file_{i}") or (request.files.get("file") if i == 0 else None) or (request.files.get("pdf") if i == 0 else None)
            if f:
                files.append(f)

        if not files:
            return jsonify({"error": "No file provided"}), 400

        for f in files:
            is_valid, error_msg = InputValidator.validate_file_upload(f)
            if not is_valid:
                return jsonify({"error": error_msg}), 400

        question = (request.form.get("question", "") or "").strip()
        is_valid, error_msg = InputValidator.validate_question(question)
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        question = InputValidator.sanitize_input(question)

        chat_history_str = request.form.get("chatHistory", "[]")
        try:
            chat_history = json.loads(chat_history_str)
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid chat history format"}), 400

        is_valid, error_msg = InputValidator.validate_chat_history(chat_history)
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        deep_think = (request.form.get("deepThink", "") or "").lower() == "true"
        n_chunks = Config.DEEP_THINK_CHUNKS if deep_think else Config.NUM_RETRIEVAL_CHUNKS
        custom_model = sanitize_model(request.form.get("model"))
        model_override = custom_model or (AIService.RESPONSE_MODEL if deep_think else None)

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

            try:
                f.save(filepath)
            except Exception as e:
                logger.error("file.save.failed", error=str(e))
                return jsonify({"error": "Failed to save file"}), 500

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
            chunk_texts = [c["text"] for c in chunks_with_pages]

            if chunk_texts:
                from langchain_core.documents import Document as LCDocument
                docs = [
                    LCDocument(
                        page_content=c["text"],
                        metadata={"document_id": document_id, "pages": json.dumps(c["pages"])},
                    )
                    for c in chunks_with_pages
                ]
                chunk_ids = [f"{document_id}_chunk_{i}" for i in range(len(docs))]
                rag_service.vectorstore.add_documents(docs, ids=chunk_ids)
                all_chunks_with_pages.extend(
                    [(document_id, c) for c in chunks_with_pages]
                )

        if not all_chunks_with_pages:
            return jsonify({"error": "Failed to extract text from uploaded file(s)"}), 500

        relevant_chunks = []
        relevant_metas = []
        try:
            total_chunks = sum(1 for _ in all_chunks_with_pages)
            results = rag_service.vectorstore.similarity_search(
                query=question,
                k=min(n_chunks, max(1, total_chunks)),
            )
            relevant_chunks = [doc.page_content for doc in results]
            relevant_metas = [doc.metadata for doc in results]
        except Exception as e:
            logger.warning("chromadb.query.failed", error=str(e))

        # Cleanup ephemeral entries
        for doc_id, _ in all_chunks_with_pages:
            try:
                rag_service.collection.delete(where={"document_id": doc_id})
            except Exception as e:
                logger.warning("chromadb.delete.failed", error=str(e))

        ai_response = ai_service.answer_from_context(
            relevant_chunks, question, chat_history,
            model_override=model_override,
            file_type=primary_file_type,
            image_paths=image_filepaths or None,
        )

        if not ai_response:
            return jsonify({"error": "Failed to generate AI response"}), 500

        for filepath in filepaths:
            try:
                os.remove(filepath)
            except Exception:
                pass

        sources = rag_service.build_sources(relevant_chunks, relevant_metas)

        return jsonify({
            "message": "Document processed successfully",
            "text": combined_text.strip(),
            "answer": ai_response,
            "file_info": all_file_infos[0] if all_file_infos else {},
            "file_infos": all_file_infos,
            "sources": sources,
        }), 200

    except Exception as e:
        logger.error("upload.failed", error=str(e))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/ask", methods=["POST"])
@jwt_required
@limiter.limit("20/minute")
def ask():
    """Accept file URLs (from UploadThing CDN) + question, run RAG pipeline."""
    import requests as http_requests

    try:
        data = request.get_json(silent=True) or {}

        file_urls = data.get("fileUrls", [])
        if not isinstance(file_urls, list) or not file_urls:
            return jsonify({"error": "fileUrls array is required"}), 400

        question = (data.get("question") or "").strip()
        is_valid, error_msg = InputValidator.validate_question(question)
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        question = InputValidator.sanitize_input(question)

        chat_history = data.get("chatHistory", [])
        is_valid, error_msg = InputValidator.validate_chat_history(chat_history)
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        deep_think = bool(data.get("deepThink", False))
        n_chunks = Config.DEEP_THINK_CHUNKS if deep_think else Config.NUM_RETRIEVAL_CHUNKS
        custom_model = sanitize_model(data.get("model"))
        model_override = custom_model or (AIService.RESPONSE_MODEL if deep_think else None)

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
                return jsonify({"error": f"File URL origin not allowed: {url}"}), 400

            try:
                dl_resp = http_requests.get(url, timeout=30, stream=True)
                dl_resp.raise_for_status()
            except Exception as e:
                logger.error("file.download.failed", url=url, error=str(e))
                return jsonify({"error": f"Failed to download file: {name}"}), 502

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
            chunk_texts = [c["text"] for c in chunks_with_pages]

            if chunk_texts:
                from langchain_core.documents import Document as LCDocument
                docs = [
                    LCDocument(
                        page_content=c["text"],
                        metadata={"document_id": document_id, "pages": json.dumps(c["pages"])},
                    )
                    for c in chunks_with_pages
                ]
                chunk_ids = [f"{document_id}_chunk_{i}" for i in range(len(docs))]
                rag_service.vectorstore.add_documents(docs, ids=chunk_ids)
                all_chunks_with_pages.extend(
                    [(document_id, c) for c in chunks_with_pages]
                )

        if not all_chunks_with_pages:
            return jsonify({"error": "Failed to extract text from uploaded file(s)"}), 500

        relevant_chunks = []
        relevant_metas = []
        try:
            total_chunks = sum(1 for _ in all_chunks_with_pages)
            results = rag_service.vectorstore.similarity_search(
                query=question,
                k=min(n_chunks, max(1, total_chunks)),
            )
            relevant_chunks = [doc.page_content for doc in results]
            relevant_metas = [doc.metadata for doc in results]
        except Exception as e:
            logger.warning("chromadb.query.failed", error=str(e))

        for doc_id, _ in all_chunks_with_pages:
            try:
                rag_service.collection.delete(where={"document_id": doc_id})
            except Exception as e:
                logger.warning("chromadb.delete.failed", error=str(e))

        ai_response = ai_service.answer_from_context(
            relevant_chunks, question, chat_history,
            model_override=model_override,
            file_type=primary_file_type,
            image_paths=image_filepaths or None,
        )

        if not ai_response:
            return jsonify({"error": "Failed to generate AI response"}), 500

        for filepath in filepaths:
            try:
                os.remove(filepath)
            except Exception:
                pass

        sources = rag_service.build_sources(relevant_chunks, relevant_metas)

        return jsonify({
            "message": "Document processed successfully",
            "text": combined_text.strip(),
            "answer": ai_response,
            "file_info": all_file_infos[0] if all_file_infos else {},
            "file_infos": all_file_infos,
            "sources": sources,
        }), 200

    except Exception as e:
        logger.error("ask.failed", error=str(e))
        return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------
# TTS endpoint
# ---------------------------------------------------------
@app.route("/tts", methods=["POST"])
@jwt_required
@limiter.limit("10/minute")
def text_to_speech():
    """Convert text to speech using OpenAI TTS API with persona voice."""
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Text is required"}), 400
        if len(text) > 4096:
            return jsonify({"error": "Text too long (max 4096 characters)"}), 400

        tts_client = ai_service.client
        if not tts_client:
            return jsonify({"error": "TTS requires OPENAI_API_KEY to be set"}), 503

        response = tts_client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text,
        )

        audio_bytes = response.content
        return Response(audio_bytes, mimetype="audio/mpeg")

    except Exception as e:
        logger.error("tts.failed", error=str(e))
        return jsonify({"error": "Failed to generate audio"}), 500


# ---------------------------------------------------------
# Export endpoints
# ---------------------------------------------------------
@app.route("/export/notion", methods=["POST"])
@jwt_required
def export_to_notion():
    """Export content to Notion using user's integration token."""
    try:
        import requests as http_requests

        data = request.get_json(silent=True) or {}
        title = data.get("title", "FileGeek Export")
        content = data.get("content", "")
        notion_token = request.headers.get("X-Notion-Token", "")

        if not notion_token:
            return jsonify({"error": "Notion integration token required"}), 400
        if not content:
            return jsonify({"error": "Content is required"}), 400

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
            return jsonify({"error": "Failed to connect to Notion. Check your token."}), 400

        results = search_resp.json().get("results", [])
        parent_id = results[0]["id"] if results else None

        if not parent_id:
            return jsonify({"error": "No pages found in Notion workspace. Create a page first."}), 400

        blocks = []
        for i in range(0, len(content), 2000):
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": content[i:i + 2000]}}]
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
                "properties": {"title": [{"text": {"content": title}}]},
                "children": blocks[:100],
            },
            timeout=15,
        )

        if create_resp.status_code in (200, 201):
            page_url = create_resp.json().get("url", "")
            return jsonify({"message": "Exported to Notion", "url": page_url}), 200
        else:
            return jsonify({"error": "Failed to create Notion page"}), 500

    except Exception as e:
        logger.error("notion.export.failed", error=str(e))
        return jsonify({"error": "Export failed"}), 500


@app.route("/export/markdown", methods=["POST"])
@jwt_required
def export_markdown():
    """Export content as Markdown file download."""
    try:
        data = request.get_json(silent=True) or {}
        title = data.get("title", "FileGeek Export")
        content = data.get("content", "")

        if not content:
            return jsonify({"error": "Content is required"}), 400

        md_content = f"# {title}\n\n{content}\n"
        return Response(
            md_content,
            mimetype="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{title}.md"'},
        )

    except Exception as e:
        logger.error("markdown.export.failed", error=str(e))
        return jsonify({"error": "Export failed"}), 500


@app.route("/export/enex", methods=["POST"])
@jwt_required
def export_enex():
    """Export content as Evernote .enex XML file."""
    try:
        data = request.get_json(silent=True) or {}
        title = data.get("title", "FileGeek Export")
        content = data.get("content", "")

        if not content:
            return jsonify({"error": "Content is required"}), 400

        from xml.sax.saxutils import escape
        now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        html_content = content.replace("\n", "<br/>")

        enex = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="{now}" application="FileGeek">
  <note>
    <title>{escape(title)}</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>{escape(html_content)}</en-note>]]></content>
    <created>{now}</created>
  </note>
</en-export>"""

        return Response(
            enex,
            mimetype="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{title}.enex"'},
        )

    except Exception as e:
        logger.error("enex.export.failed", error=str(e))
        return jsonify({"error": "Export failed"}), 500


# ---------------------------------------------------------
# Error handlers
# ---------------------------------------------------------
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large (max 10MB)"}), 413


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(429)
def rate_limited(e):
    return jsonify({
        "error": "Rate limit exceeded",
        "retry_after": e.description if hasattr(e, "description") else "Please wait before retrying.",
    }), 429


@app.errorhandler(500)
def internal_error(e):
    logger.error("internal_error", error=str(e))
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------
if __name__ == "__main__":
    has_gemini = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    has_openai = os.getenv("OPENAI_API_KEY")
    if not has_gemini and not has_openai:
        logger.error("Set GOOGLE_API_KEY (Gemini) or OPENAI_API_KEY to start the server")
        raise SystemExit(1)

    logger.info(f"Starting FileGeek backend server on port {Config.PORT}...")
    app.run(debug=False, host=Config.HOST, port=Config.PORT)
