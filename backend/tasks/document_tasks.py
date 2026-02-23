"""Async document indexing via Celery."""

import json
import re
from datetime import datetime

from celery_app import celery_app
from celery_db import SyncSession
from logging_config import get_logger
from models_async import ChatMessage, SessionDocument
from services.ai_service import AIService
from services.file_service import FileService
from services.rag_service import RAGService

logger = get_logger(__name__)

ai_service = AIService()
file_service = FileService()
rag_service = RAGService(ai_service, file_service)


def _publish_progress(task_id, phase, progress, data=None):
    """Publish indexing progress via Socket.IO Redis manager (best-effort)."""
    try:
        import socketio as _sio
        from config import Config

        external_sio = _sio.RedisManager(Config.REDIS_URL, write_only=True)
        payload = {
            "task_id": task_id,
            "phase": phase,
            "progress": progress,
            **(data or {}),
        }
        external_sio.emit("progress", payload, room=f"task:{task_id}")
    except Exception:
        pass  # Fail silently — update_state() still works as fallback


@celery_app.task(bind=True, max_retries=2, default_retry_delay=5)
def index_document_task(self, session_id, user_id, file_url, file_name):
    """Download, extract, and index a document into ChromaDB.

    Phases reported via update_state and Redis pub/sub:
      DOWNLOADING → EXTRACTING → INDEXING → completed
    """
    from werkzeug.utils import secure_filename

    document_id = f"{session_id}_{secure_filename(file_name)}_{datetime.now().strftime('%H%M%S')}"
    task_id = self.request.id

    try:
        # Phase 1: Downloading
        self.update_state(state="DOWNLOADING", meta={"phase": "downloading", "file_name": file_name})
        _publish_progress(task_id, "downloading", 20)
        logger.info("document.download.start", file_url=file_url, session_id=session_id)

        # Phase 2: Extracting + Indexing
        self.update_state(state="EXTRACTING", meta={"phase": "extracting", "file_name": file_name})
        _publish_progress(task_id, "extracting", 50)

        result = rag_service.index_from_url(file_url, file_name, document_id, session_id, user_id)

        # Phase 3: Storing DB record
        self.update_state(state="INDEXING", meta={"phase": "indexing", "file_name": file_name})
        _publish_progress(task_id, "indexing", 80)

        with SyncSession() as session:
            doc_record = SessionDocument(
                session_id=session_id,
                file_name=file_name,
                file_type=result.get("file_type", "unknown"),
                file_url=file_url,
                chroma_document_id=document_id,
                chunk_count=result.get("chunk_count", 0),
                page_count=result.get("page_count", 0),
            )
            session.add(doc_record)
            session.commit()
            session.refresh(doc_record)
            doc_dict = doc_record.to_dict()

        logger.info("document.indexed", document_id=document_id, chunks=result.get("chunk_count", 0))
        _publish_progress(task_id, "completed", 100, {"document": doc_dict})

        # Kick off auto-flashcard generation as a chained subtask (best-effort)
        text_excerpt = result.get("text", "")[:4000]
        if text_excerpt:
            auto_generate_flashcards_task.delay(session_id, user_id, text_excerpt)

        return {
            "status": "completed",
            "document": doc_dict,
        }

    except Exception as exc:
        logger.error("document.index.failed", error=str(exc), session_id=session_id)
        _publish_progress(task_id, "failure", 0, {"error": str(exc)})
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=1, default_retry_delay=10)
def auto_generate_flashcards_task(self, session_id, user_id, text_excerpt):
    """
    Celery subtask: auto-generate 5 study flashcards from document text and
    store them as a system assistant message in the session.

    Triggered automatically after successful document indexing.
    """
    try:
        raw_answer = ai_service.answer_from_context(
            context_chunks=[text_excerpt],
            question=(
                "Generate exactly 5 concise study flashcards from this document content. "
                "Return ONLY a valid JSON array, no other text: "
                '[{"front": "term or question", "back": "definition or answer"}, ...]'
            ),
            chat_history=[],
        )
        if not raw_answer:
            return {"status": "skipped", "reason": "empty AI response"}

        json_match = re.search(r'\[.*\]', raw_answer, re.DOTALL)
        if not json_match:
            logger.warning("auto_flashcards.no_json session=%s", session_id)
            return {"status": "skipped", "reason": "no JSON array in response"}

        cards = json.loads(json_match.group())
        if not isinstance(cards, list) or len(cards) == 0:
            return {"status": "skipped", "reason": "empty cards list"}

        with SyncSession() as db_session:
            msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content="I've prepared some starter flashcards from your document!",
                artifacts_json=json.dumps([{
                    "type": "flashcards",
                    "artifact_type": "flashcards",
                    "cards": cards[:10],
                }]),
            )
            db_session.add(msg)
            db_session.commit()
            logger.info(
                "auto_flashcards.created session=%s cards=%d", session_id, len(cards[:10])
            )
            return {"status": "completed", "cards": len(cards[:10])}

    except Exception as exc:
        logger.warning("auto_flashcards.failed session=%s: %s", session_id, exc)
        raise self.retry(exc=exc)
