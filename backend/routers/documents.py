"""
routers/documents.py — Document library, deletion, related-document lookup, and indexing.
"""

import asyncio
import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select

from config import Config
from dependencies import CurrentUser, DB
from logging_config import get_logger
from models_async import SessionDocument, StudySession
from services.registry import rag_service
from tasks.document_tasks import auto_generate_flashcards_bg
from utils.cache import get_redis, make_etag, check_etag
from services.registry import memory_service

logger = get_logger(__name__)
router = APIRouter(tags=["documents"])
limiter = Limiter(key_func=get_remote_address)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER
ALLOWED_URL_PREFIXES = Config.ALLOWED_URL_PREFIXES

_celery_available = False
try:
    from celery_app import celery_app  # noqa: F401
    _celery_available = True
except Exception:
    pass


@router.get("/library")
async def get_library(
    request: Request, response: Response, current_user: CurrentUser, db: DB
):
    from fastapi import Response as _Resp
    result = await db.execute(
        select(SessionDocument, StudySession.title.label("session_title"))
        .join(StudySession, SessionDocument.session_id == StudySession.id)
        .where(StudySession.user_id == current_user.id)
        .order_by(SessionDocument.indexed_at.desc())
        .limit(100)
    )
    docs = []
    seen_files = set()
    for doc, session_title in result.all():
        if doc.file_name in seen_files:
            continue
        seen_files.add(doc.file_name)
        d = doc.to_dict()
        d["session_title"] = session_title
        docs.append(d)

    loop = asyncio.get_event_loop()
    try:
        prefs = await loop.run_in_executor(
            None, memory_service.get_user_preferences, current_user.id
        )
    except Exception as exc:
        logger.warning("memory.preferences.failed", error=str(exc))
        prefs = "No highlights yet. Chat more to build memory!"

    data = {"documents": docs, "preferences": prefs}

    etag = make_etag(data)
    if check_etag(request, etag):
        return _Resp(status_code=304)

    r = get_redis()
    if r:
        r.set(f"etag:library:{current_user.id}", etag, ex=60)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=15"
    return data


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, current_user: CurrentUser, db: DB):
    doc = await db.scalar(
        select(SessionDocument)
        .join(StudySession, SessionDocument.session_id == StudySession.id)
        .where(StudySession.user_id == current_user.id, SessionDocument.id == doc_id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        rag_service.collection.delete(where={"document_id": doc.chroma_document_id})
    except Exception as exc:
        logger.warning("chromadb.delete.doc.failed", doc_id=doc.chroma_document_id, error=str(exc))

    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted"}


@router.get("/sessions/{session_id}/related")
@limiter.limit("30/minute")
async def get_related_documents(
    request: Request, session_id: str, current_user: CurrentUser, db: DB
):
    """Return semantically related documents from other sessions."""
    related_raw = await rag_service.find_related_documents_async(session_id, current_user.id)
    enriched = []
    for item in related_raw:
        sess = await db.get(StudySession, item["session_id"])
        enriched.append({
            **item,
            "session_title": sess.title if sess else "Unknown Session",
        })
    return {"related": enriched}


@router.post("/sessions/{session_id}/documents", status_code=202)
@limiter.limit("20/minute")
async def index_session_document(
    session_id: str,
    request: Request,
    current_user: CurrentUser,
    db: DB,
    background_tasks: BackgroundTasks,
):
    import unicodedata
    from werkzeug.utils import secure_filename

    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id, StudySession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    content_type = request.headers.get("content-type", "")
    is_local_upload = "multipart/form-data" in content_type

    if not is_local_upload:
        # ── Remote URL path ──────────────────────────────────────────────────────
        try:
            data = await request.json()
            file_url = data.get("url")
            file_name = data.get("name")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON data")

        safe_name = unicodedata.normalize("NFKD", file_name).encode("ascii", "ignore").decode("ascii")
        document_id = f"{session_id}_{secure_filename(safe_name)}_{datetime.now().strftime('%H%M%S')}"

        allowed_prefixes = ALLOWED_URL_PREFIXES
        if Config.S3_ENABLED and Config.AWS_S3_BUCKET:
            allowed_prefixes = allowed_prefixes + (
                f"https://{Config.AWS_S3_BUCKET}.s3.{Config.AWS_S3_REGION}.amazonaws.com/",
            )
        if file_url and not any(file_url.startswith(p) for p in allowed_prefixes):
            raise HTTPException(status_code=400, detail="File URL origin not allowed")

        if _celery_available:
            from tasks.document_tasks import index_document_task
            task = index_document_task.delay(session_id, current_user.id, file_url, file_name)
            logger.info("document.task.dispatched", task_id=task.id, session_id=session_id)
            return {"task_id": task.id, "status": "queued"}

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

    # ── Local multipart upload ───────────────────────────────────────────────────
    form = await request.form()
    uploaded_files = form.getlist("file")
    if not uploaded_files:
        raise HTTPException(status_code=400, detail="No file provided")

    base_url = str(request.base_url).rstrip("/")
    loop = asyncio.get_event_loop()
    indexed_docs = []
    _first_indexed_text = ""

    for uploaded_file in uploaded_files:
        raw_name = uploaded_file.filename or "file"
        safe_name = unicodedata.normalize("NFKD", raw_name).encode("ascii", "ignore").decode("ascii")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        saved_filename = f"{timestamp}_{secure_filename(safe_name)}"
        filepath = os.path.join(Config.UPLOAD_FOLDER, saved_filename)
        document_id = f"{session_id}_{secure_filename(safe_name)}_{timestamp}"

        try:
            content = await uploaded_file.read()
            with open(filepath, "wb") as f:
                f.write(content)
        except Exception as exc:
            logger.error("document.upload.failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Failed to save file: {raw_name}")

        try:
            idx_result = await loop.run_in_executor(
                None,
                rag_service.index_document,
                filepath, document_id, session_id, current_user.id,
            )
            file_url = f"{base_url}/static/uploads/{saved_filename}"
            if not _first_indexed_text:
                _first_indexed_text = idx_result.get("text", "")
        except Exception as exc:
            logger.error("document.local_index.failed: %s", exc)
            try:
                os.remove(filepath)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Failed to index: {raw_name}")

        _ext = os.path.splitext(raw_name.lower())[1].lstrip(".")
        _type_map = {
            "pdf": "pdf", "docx": "docx", "txt": "txt",
            "png": "image", "jpg": "image", "jpeg": "image",
            "mp3": "audio", "wav": "audio", "m4a": "audio",
            "webm": "audio", "ogg": "audio",
        }
        doc_record = SessionDocument(
            session_id=session_id,
            file_name=raw_name,
            file_type=_type_map.get(_ext, idx_result.get("file_type", "unknown")),
            file_url=file_url,
            chroma_document_id=document_id,
            chunk_count=idx_result.get("chunk_count", 0),
            page_count=idx_result.get("page_count", 0),
        )
        db.add(doc_record)
        indexed_docs.append(doc_record)

    await db.commit()
    for doc in indexed_docs:
        await db.refresh(doc)

    if indexed_docs and _first_indexed_text:
        background_tasks.add_task(
            auto_generate_flashcards_bg, session_id, current_user.id, _first_indexed_text
        )

    if len(indexed_docs) == 1:
        return {"message": "Document indexed", "document": indexed_docs[0].to_dict()}
    return {"message": f"{len(indexed_docs)} documents indexed", "documents": [d.to_dict() for d in indexed_docs]}
