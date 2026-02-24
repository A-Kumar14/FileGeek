"""
services/document_processor.py — Async pipeline for FastAPI routes.

For Celery workers, the equivalent sync pipeline lives in document_tasks.py.
"""

import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

from config import Config

logger = logging.getLogger(__name__)


@dataclass
class ProcessResult:
    chunk_count: int = 0
    page_count: int = 0
    text: str = ""
    filepath: Optional[str] = None
    file_type: Optional[str] = None
    file_info: Optional[dict] = None
    error: Optional[str] = None


class DocumentProcessor:
    """Wraps file extraction + chunking + vector indexing in a single async call."""

    def __init__(self, file_service, vector_store, embedding_service):
        self._fs = file_service
        self._vs = vector_store
        self._emb = embedding_service

    async def process_file(
        self,
        filepath: str,
        document_id: str,
        session_id: str,
        user_id: int,
        db,  # AsyncSession
    ) -> ProcessResult:
        """
        Extract text from *filepath*, chunk it, embed, and store in SQLite.
        Runs CPU-bound extraction in a thread pool executor so the event loop is
        not blocked.
        """
        loop = asyncio.get_event_loop()

        try:
            # CPU-bound: extract text
            page_texts = await loop.run_in_executor(
                None, self._fs.extract_text_universal, filepath
            )
            if not page_texts:
                return ProcessResult(error="Could not extract text from file")

            extracted_text = "\n\n".join(p["text"] for p in page_texts)

            # CPU-bound: chunk text with page provenance
            chunks_with_pages = await loop.run_in_executor(
                None, self._fs.chunking_function_with_pages, page_texts
            )

            if not chunks_with_pages:
                return ProcessResult(
                    page_count=len(page_texts),
                    text=extracted_text,
                    error="No chunks produced",
                )

            # Embed + store (embedding is I/O-bound; run in executor)
            chunk_count = await loop.run_in_executor(
                None,
                lambda: self._index_sync(
                    session_id, user_id, document_id, chunks_with_pages
                ),
            )

            file_type = self._fs.detect_file_type(filepath)
            file_info = self._fs.get_file_info(filepath)

            logger.info(
                "DocumentProcessor.process_file: doc=%s session=%s chunks=%d pages=%d",
                document_id, session_id, chunk_count, len(page_texts),
            )

            return ProcessResult(
                chunk_count=chunk_count,
                page_count=len(page_texts),
                text=extracted_text,
                filepath=filepath,
                file_type=file_type,
                file_info=file_info,
            )

        except Exception as exc:
            logger.error(
                "DocumentProcessor.process_file failed doc=%s: %s", document_id, exc
            )
            return ProcessResult(error=str(exc))

    def _index_sync(self, session_id, user_id, document_id, chunks):
        """Sync helper that embeds and stores chunks using SyncSession."""
        from celery_db import SyncSession

        with SyncSession() as db_sync:
            return self._vs.index_chunks_sync(
                session_id=session_id,
                user_id=user_id,
                document_id=document_id,
                chunks=chunks,
                db=db_sync,
            )

    async def process_from_url(
        self,
        url: str,
        name: str,
        document_id: str,
        session_id: str,
        user_id: int,
        db,  # AsyncSession
    ) -> ProcessResult:
        """Download from CDN then process."""
        import requests as http_requests
        from werkzeug.utils import secure_filename

        filename = secure_filename(name) or "file"
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(Config.UPLOAD_FOLDER, safe_filename)

        loop = asyncio.get_event_loop()

        def _download():
            dl_resp = http_requests.get(url, timeout=30, stream=True)
            dl_resp.raise_for_status()
            with open(filepath, "wb") as fout:
                for chunk in dl_resp.iter_content(chunk_size=8192):
                    fout.write(chunk)

        try:
            await loop.run_in_executor(None, _download)
        except Exception as e:
            logger.error("DocumentProcessor.download failed url=%s: %s", url, e)
            return ProcessResult(error=f"Download failed: {e}")

        try:
            result = await self.process_file(filepath, document_id, session_id, user_id, db)
            return result
        finally:
            try:
                os.remove(filepath)
            except Exception:
                pass
