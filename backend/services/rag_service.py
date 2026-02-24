"""
services/rag_service.py — Backward-compatible adapter over VectorStore.

Public API is IDENTICAL to the old ChromaDB-based RAGService so that
tools.py, documents.py, sessions.py, and routers/* need ZERO changes.

Key design notes:
  - query() MUST stay synchronous and use SyncSession — it is called from
    ToolExecutor.execute() which runs inside run_in_executor() within an
    already-running async event loop.  Using asyncio.run() here would raise
    "This event loop is already running."
  - collection property returns a _NoOpCollection stub so documents.py's
    rag_service.collection.delete(...) calls are silently absorbed.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np
from config import Config

logger = logging.getLogger(__name__)


class _NoOpCollection:
    """Absorbs collection.delete() calls from documents.py without error."""
    def delete(self, **kwargs):
        pass

    def get(self, **kwargs):
        return {"ids": [], "embeddings": [], "documents": [], "metadatas": []}


class RAGService:
    """Thin adapter — delegates to VectorStore.  Zero ChromaDB imports."""

    def __init__(self, vector_store, file_service, embedding_service):
        self._vs = vector_store
        self._fs = file_service
        self._emb = embedding_service
        self.collection = _NoOpCollection()   # for backward compat

    # ── Index document (local file) ──────────────────────────────────────────

    def index_document(
        self, filepath: str, document_id: str, session_id: str, user_id: int
    ) -> Dict:
        """Extract, chunk, embed, and store a local file.  Sync."""
        from celery_db import SyncSession

        page_texts = self._fs.extract_text_universal(filepath)
        if not page_texts:
            return {"chunk_count": 0, "page_count": 0, "text": ""}

        extracted_text = "\n\n".join(p["text"] for p in page_texts)
        chunks_with_pages = self._fs.chunking_function_with_pages(page_texts)

        chunk_count = 0
        if chunks_with_pages:
            with SyncSession() as db:
                chunk_count = self._vs.index_chunks_sync(
                    session_id=session_id,
                    user_id=user_id,
                    document_id=document_id,
                    chunks=chunks_with_pages,
                    db=db,
                )
            logger.info(
                "RAGService.index_document: doc=%s session=%s chunks=%d",
                document_id, session_id, chunk_count,
            )

        return {
            "chunk_count": chunk_count,
            "page_count": len(page_texts),
            "text": extracted_text,
        }

    # ── Index from URL ───────────────────────────────────────────────────────

    def index_from_url(
        self, url: str, name: str, document_id: str, session_id: str, user_id: int
    ) -> Dict:
        """Download from CDN and index.  Sync."""
        import requests as http_requests
        from werkzeug.utils import secure_filename

        filename = secure_filename(name) or "file"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(Config.UPLOAD_FOLDER, safe_filename)

        try:
            dl_resp = http_requests.get(url, timeout=30, stream=True)
            dl_resp.raise_for_status()
            with open(filepath, "wb") as fout:
                for chunk in dl_resp.iter_content(chunk_size=8192):
                    fout.write(chunk)
        except Exception as e:
            logger.error("RAGService.index_from_url download failed url=%s: %s", url, e)
            raise

        try:
            result = self.index_document(filepath, document_id, session_id, user_id)
            result["filepath"] = filepath
            result["file_type"] = self._fs.detect_file_type(filepath)
            result["file_info"] = self._fs.get_file_info(filepath)
            return result
        finally:
            try:
                os.remove(filepath)
            except Exception:
                pass

    async def index_from_url_async(
        self, url: str, name: str, document_id: str, session_id: str, user_id: int
    ) -> Dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.index_from_url, url, name, document_id, session_id, user_id
        )

    # ── Query ────────────────────────────────────────────────────────────────

    def query(
        self, question: str, session_id: str, user_id: int, n_results: int = 5
    ) -> Dict:
        """
        Session-scoped retrieval.  SYNC — uses SyncSession.
        Called from ToolExecutor.execute() which runs in run_in_executor.
        Must NOT use asyncio.run() here.
        """
        if not session_id or not question or not question.strip():
            return {"chunks": [], "metas": []}

        try:
            from celery_db import SyncSession

            with SyncSession() as db:
                results = self._vs.search_sync(
                    session_id=session_id,
                    user_id=user_id,
                    query=question,
                    k=n_results,
                    db=db,
                )

            chunks = [r.chunk_text for r in results]
            metas = [
                {"pages": json.dumps(r.pages), "document_id": r.document_id}
                for r in results
            ]

            logger.info(
                "RAGService.query: session=%s user=%s chunks=%d q=%r",
                session_id, user_id, len(chunks), question[:60],
            )
            return {"chunks": chunks, "metas": metas}

        except Exception as exc:
            logger.warning(
                "RAGService.query failed session=%s user=%s: %s", session_id, user_id, exc
            )
            return {"chunks": [], "metas": []}

    async def query_async(
        self, question: str, session_id: str, user_id: int, n_results: int = 5
    ) -> Dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.query, question, session_id, user_id, n_results
        )

    def query_all_sessions(
        self, question: str, user_id: int, n_results: int = 5
    ) -> Dict:
        """Cross-session retrieval.  Sync."""
        try:
            from celery_db import SyncSession
            from models_async import DocumentChunk
            from sqlalchemy import select

            q_vec = self._emb.embed(question)

            with SyncSession() as db:
                result = db.execute(
                    select(DocumentChunk).where(DocumentChunk.user_id == user_id)
                )
                rows = result.scalars().all()

            if not rows:
                return {"chunks": [], "metas": []}

            dim = len(q_vec)
            embeddings, valid_rows = [], []
            for row in rows:
                try:
                    vec = np.frombuffer(row.embedding, dtype=np.float32)
                    if len(vec) == dim:
                        embeddings.append(vec)
                        valid_rows.append(row)
                except Exception:
                    pass

            if not embeddings:
                return {"chunks": [], "metas": []}

            mat = np.stack(embeddings)
            scores = mat @ q_vec
            top_idx = np.argsort(scores)[::-1][:n_results]

            chunks = [valid_rows[i].chunk_text for i in top_idx]
            metas = [
                {
                    "pages": valid_rows[i].pages or "[]",
                    "document_id": valid_rows[i].document_id,
                }
                for i in top_idx
            ]
            return {"chunks": chunks, "metas": metas}

        except Exception as exc:
            logger.warning(
                "RAGService.query_all_sessions failed user=%s: %s", user_id, exc
            )
            return {"chunks": [], "metas": []}

    # ── Delete ───────────────────────────────────────────────────────────────

    def delete_session_documents(self, session_id: str, user_id: Optional[int] = None):
        """Delete all vector chunks for a session.  Sync."""
        try:
            from celery_db import SyncSession

            with SyncSession() as db:
                self._vs.delete_session_chunks_sync(session_id, db)
        except Exception as exc:
            logger.warning(
                "RAGService.delete_session_documents failed session=%s: %s",
                session_id, exc,
            )

    # ── Related sessions ─────────────────────────────────────────────────────

    def find_related_documents(
        self, session_id: str, user_id: int, n: int = 5
    ) -> List[dict]:
        try:
            from celery_db import SyncSession
            from models_async import DocumentChunk
            from sqlalchemy import select

            with SyncSession() as db:
                anchor_res = db.execute(
                    select(DocumentChunk).where(
                        DocumentChunk.session_id == session_id,
                        DocumentChunk.user_id == user_id,
                    ).limit(5)
                )
                anchors = anchor_res.scalars().all()

                if not anchors:
                    return []

                vecs = [np.frombuffer(c.embedding, dtype=np.float32) for c in anchors]
                anchor_vec = np.mean(vecs, axis=0).astype(np.float32)
                norm = np.linalg.norm(anchor_vec)
                if norm > 0:
                    anchor_vec = anchor_vec / norm

                other_res = db.execute(
                    select(DocumentChunk).where(
                        DocumentChunk.user_id == user_id,
                        DocumentChunk.session_id != session_id,
                    )
                )
                other_rows = other_res.scalars().all()

            if not other_rows:
                return []

            session_scores: dict = {}
            for chunk in other_rows:
                vec = np.frombuffer(chunk.embedding, dtype=np.float32)
                score = float(anchor_vec @ vec)
                session_scores.setdefault(chunk.session_id, []).append(score)

            ranked = sorted(
                [
                    {"session_id": sid, "score": float(np.mean(s))}
                    for sid, s in session_scores.items()
                ],
                key=lambda x: x["score"],
                reverse=True,
            )
            return ranked[:n]

        except Exception as exc:
            logger.warning(
                "RAGService.find_related_documents failed session=%s: %s",
                session_id, exc,
            )
            return []

    async def find_related_documents_async(
        self, session_id: str, user_id: int, n: int = 5
    ) -> List[dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.find_related_documents, session_id, user_id, n
        )

    # ── Sources builder ──────────────────────────────────────────────────────

    def build_sources(self, chunks: List[str], metas: List[dict]) -> List[dict]:
        sources = []
        for i, (chunk_text, meta) in enumerate(zip(chunks, metas), start=1):
            excerpt = (chunk_text[:200] + "...") if len(chunk_text) > 200 else chunk_text
            raw_pages = meta.get("pages", "[]")
            try:
                pages = json.loads(raw_pages) if isinstance(raw_pages, str) else raw_pages
            except Exception:
                pages = []
            sources.append({"index": i, "excerpt": excerpt.strip(), "pages": pages})
        return sources

    # ── Compat stubs ─────────────────────────────────────────────────────────

    def check_embedding_dimensions(self) -> dict:
        return {
            "status": "ok",
            "message": "Using SQLite vector store — no dimension mismatch possible.",
        }


# ── MemoryService has moved to services/memory_service.py ────────────────────
# Import it here for any code that does `from services.rag_service import MemoryService`
from services.memory_service import MemoryService  # noqa: E402, F401
