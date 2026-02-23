"""
routers/legacy.py — Stateless /upload, /ask, and /s3/presign endpoints (backward compat).
These bypass session management and do ad-hoc RAG directly on uploaded files.
"""

import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import Config
from dependencies import CurrentUser, DB
from logging_config import get_logger
from schemas import S3PresignRequest
from services.ai_service import AIService
from services.registry import ai_service, file_service, rag_service
from utils.validators import InputValidator

logger = get_logger(__name__)
router = APIRouter(tags=["legacy"])
limiter = Limiter(key_func=get_remote_address)

UPLOAD_FOLDER = Config.UPLOAD_FOLDER
ALLOWED_URL_PREFIXES = Config.ALLOWED_URL_PREFIXES


@router.post("/s3/presign")
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


@router.post("/upload")
@limiter.limit("20/minute")
async def upload_file(request: Request, current_user: CurrentUser, db: DB):
    """Legacy multipart upload endpoint (kept for backward compat)."""
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
        model_override=model_override,
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


@router.post("/ask")
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
        except Exception:
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
        model_override=model_override,
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
