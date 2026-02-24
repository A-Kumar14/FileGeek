"""Async document indexing via Celery + FastAPI background flashcard generation."""

import asyncio
import json
import re
from datetime import datetime

from sqlalchemy import select

from celery_app import celery_app
from celery_db import SyncSession
from database import AsyncSessionLocal
from logging_config import get_logger
from models_async import ChatMessage, SessionDocument

logger = get_logger(__name__)


def _get_services():
    """Lazy-load services to avoid import-time I/O in Celery workers."""
    from services.registry import file_service, vector_store, embedding_service, llm_service
    return file_service, vector_store, embedding_service, llm_service


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
    """
    Download, extract, chunk, embed, and index a document into SQLite.

    Phases:
      DOWNLOADING → EXTRACTING → INDEXING → completed
    """
    import os
    import requests as http_requests
    from config import Config
    from werkzeug.utils import secure_filename

    file_service, vector_store, embedding_service, llm_service = _get_services()

    filename = secure_filename(file_name) or "file"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    safe_filename = f"{timestamp}_{filename}"
    filepath = os.path.join(Config.UPLOAD_FOLDER, safe_filename)
    document_id = f"{session_id}_{filename}_{datetime.now().strftime('%H%M%S')}"
    task_id = self.request.id

    try:
        # Phase 1: Download
        self.update_state(state="DOWNLOADING", meta={"phase": "downloading", "file_name": file_name})
        _publish_progress(task_id, "downloading", 20)
        logger.info("document.download.start", file_url=file_url, session_id=session_id)

        dl_resp = http_requests.get(file_url, timeout=30, stream=True)
        dl_resp.raise_for_status()
        with open(filepath, "wb") as fout:
            for chunk in dl_resp.iter_content(chunk_size=8192):
                fout.write(chunk)

        # Phase 2: Extract text
        self.update_state(state="EXTRACTING", meta={"phase": "extracting", "file_name": file_name})
        _publish_progress(task_id, "extracting", 50)

        page_texts = file_service.extract_text_universal(filepath)
        if not page_texts:
            raise ValueError(f"Could not extract text from {file_name}")

        extracted_text = "\n\n".join(p["text"] for p in page_texts)
        chunks_with_pages = file_service.chunking_function_with_pages(page_texts)

        # Phase 3: Embed + store
        self.update_state(state="INDEXING", meta={"phase": "indexing", "file_name": file_name})
        _publish_progress(task_id, "indexing", 80)

        chunk_count = 0
        if chunks_with_pages:
            with SyncSession() as db:
                chunk_count = vector_store.index_chunks_sync(
                    session_id=session_id,
                    user_id=user_id,
                    document_id=document_id,
                    chunks=chunks_with_pages,
                    db=db,
                )

        file_type = file_service.detect_file_type(filepath)

        # Phase 4: Save DB record
        with SyncSession() as db:
            doc_record = SessionDocument(
                session_id=session_id,
                file_name=file_name,
                file_type=file_type,
                file_url=file_url,
                chroma_document_id=document_id,
                chunk_count=chunk_count,
                page_count=len(page_texts),
            )
            db.add(doc_record)
            db.commit()
            db.refresh(doc_record)
            doc_dict = doc_record.to_dict()

        logger.info(
            "document.indexed", document_id=document_id, chunks=chunk_count,
            session_id=session_id
        )
        _publish_progress(task_id, "completed", 100, {"document": doc_dict})

        # Kick off auto-flashcard generation (best-effort)
        text_excerpt = extracted_text[:4000]
        if text_excerpt:
            auto_generate_flashcards_task.delay(session_id, user_id, text_excerpt)

        return {"status": "completed", "document": doc_dict}

    except Exception as exc:
        logger.error("document.index.failed", error=str(exc), session_id=session_id)
        _publish_progress(task_id, "failure", 0, {"error": str(exc)})
        raise self.retry(exc=exc)
    finally:
        try:
            import os as _os
            _os.remove(filepath)
        except Exception:
            pass


@celery_app.task(bind=True, max_retries=1, default_retry_delay=10)
def auto_generate_flashcards_task(self, session_id, user_id, text_excerpt):
    """
    Celery subtask: auto-generate 5 study flashcards and store them as a
    system assistant message.  Uses asyncio.run(llm_service.simple_response())
    which is safe in Celery (no running event loop in worker threads).
    """
    try:
        _, _, _, llm_service = _get_services()

        prompt = (
            "Generate exactly 5 concise study flashcards from this document content. "
            "Return ONLY a valid JSON array, no other text: "
            '[{"front": "term or question", "back": "definition or answer"}, ...]\n\n'
            f"Document content:\n{text_excerpt}"
        )

        raw_answer = asyncio.run(llm_service.simple_response(prompt))

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

    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("auto_flashcards.bad_output session=%s: %s", session_id, exc)
        return {"status": "failed", "reason": str(exc)}
    except Exception as exc:
        logger.warning("auto_flashcards.transient_error session=%s: %s", session_id, exc)
        raise self.retry(exc=exc)


async def auto_generate_flashcards_bg(session_id: str, user_id: int, text_excerpt: str):
    """
    FastAPI BackgroundTask: generate 5 flashcards after synchronous (non-Celery)
    document indexing and store them as an assistant message.
    """
    async with AsyncSessionLocal() as db:
        try:
            existing = await db.execute(
                select(ChatMessage).where(
                    ChatMessage.session_id == session_id,
                    ChatMessage.role == "assistant",
                    ChatMessage.artifacts_json.like('%"artifact_type": "flashcards"%'),
                ).limit(1)
            )
            if existing.scalar_one_or_none():
                logger.info("auto_flashcards.skipped.duplicate session=%s", session_id)
                return

            from services.registry import llm_service as _llm
            prompt = (
                "Generate 5 study flashcards from this document content. "
                "Return ONLY a JSON array of {front, back} objects.\n\n"
                f"Document:\n{text_excerpt[:3000]}"
            )
            raw_answer = await _llm.simple_response(prompt)

            if not raw_answer:
                return

            json_match = re.search(r'\[.*\]', raw_answer, re.DOTALL)
            if not json_match:
                return

            cards = json.loads(json_match.group())
            if not isinstance(cards, list) or len(cards) == 0:
                return

            msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content="I've prepared some starter flashcards from your document to help you get started!",
                artifacts_json=json.dumps([{
                    "type": "flashcards",
                    "artifact_type": "flashcards",
                    "cards": cards[:10],
                }]),
            )
            db.add(msg)
            await db.commit()
            logger.info(
                "auto_flashcards.created session=%s cards=%d", session_id, len(cards[:10])
            )
        except Exception as exc:
            logger.warning("auto_flashcards.failed session=%s: %s", session_id, exc)
