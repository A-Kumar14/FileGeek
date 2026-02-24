"""
services/vector_store.py — SQLite-backed vector store using numpy cosine similarity.

All state lives in the database; this class holds no in-memory collections.
Safe to use as a module-level singleton with multiple gunicorn workers because:
  - Reads are concurrent (SQLite WAL mode)
  - Writes go through the AsyncSession / SyncSession from SQLAlchemy

Cosine similarity is computed as a dot product because all vectors are
L2-normalised at embed time.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models_async import DocumentChunk

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    chunk_text: str
    pages: List[int]
    document_id: str
    score: float
    chunk_index: int = 0


class VectorStore:
    """Stateless vector store — all methods receive a db session argument."""

    def __init__(self, embedding_service):
        self._emb = embedding_service

    # ── indexing ─────────────────────────────────────────────────────────────

    async def index_chunks(
        self,
        session_id: str,
        user_id: int,
        document_id: str,
        chunks: List[dict],   # each: {text, pages}
        db: AsyncSession,
    ) -> int:
        """
        Embed *chunks* and persist them.  Returns the number of chunks stored.
        chunks format: [{"text": "...", "pages": [1, 2]}]
        """
        if not chunks:
            return 0

        texts = [c["text"] for c in chunks]
        embeddings = self._emb.embed_batch(texts)

        rows = []
        for i, (chunk, vec) in enumerate(zip(chunks, embeddings)):
            rows.append(DocumentChunk(
                session_id=session_id,
                user_id=user_id,
                document_id=document_id,
                chunk_text=chunk["text"],
                embedding=vec.tobytes(),
                pages=json.dumps(chunk.get("pages", [])),
                chunk_index=i,
            ))

        db.add_all(rows)
        await db.commit()
        logger.info(
            f"VectorStore.index_chunks: stored {len(rows)} chunks "
            f"session={session_id} doc={document_id}"
        )
        return len(rows)

    def index_chunks_sync(
        self,
        session_id: str,
        user_id: int,
        document_id: str,
        chunks: List[dict],
        db,  # SyncSession
    ) -> int:
        """Synchronous version for Celery workers."""
        if not chunks:
            return 0

        texts = [c["text"] for c in chunks]
        embeddings = self._emb.embed_batch(texts)

        rows = []
        for i, (chunk, vec) in enumerate(zip(chunks, embeddings)):
            rows.append(DocumentChunk(
                session_id=session_id,
                user_id=user_id,
                document_id=document_id,
                chunk_text=chunk["text"],
                embedding=vec.tobytes(),
                pages=json.dumps(chunk.get("pages", [])),
                chunk_index=i,
            ))

        db.add_all(rows)
        db.commit()
        logger.info(
            f"VectorStore.index_chunks_sync: stored {len(rows)} chunks "
            f"session={session_id} doc={document_id}"
        )
        return len(rows)

    # ── search ───────────────────────────────────────────────────────────────

    async def search(
        self,
        session_id: str,
        user_id: int,
        query: str,
        k: int = 5,
        db: AsyncSession = None,
    ) -> List[SearchResult]:
        """Semantic search within a single session."""
        query_vec = self._emb.embed(query)
        result = await db.execute(
            select(DocumentChunk).where(
                DocumentChunk.session_id == session_id,
                DocumentChunk.user_id == user_id,
            )
        )
        rows = result.scalars().all()
        return self._rank(rows, query_vec, k)

    def search_sync(
        self,
        session_id: str,
        user_id: int,
        query: str,
        k: int = 5,
        db=None,  # SyncSession
    ) -> List[SearchResult]:
        """Synchronous version — used by rag_service.query() which is called from tools."""
        from sqlalchemy import text as sa_text

        query_vec = self._emb.embed(query)
        result = db.execute(
            select(DocumentChunk).where(
                DocumentChunk.session_id == session_id,
                DocumentChunk.user_id == user_id,
            )
        )
        rows = result.scalars().all()
        return self._rank(rows, query_vec, k)

    async def search_cross_session(
        self,
        user_id: int,
        query: str,
        k: int = 5,
        db: AsyncSession = None,
    ) -> List[SearchResult]:
        """Semantic search across all of a user's sessions."""
        query_vec = self._emb.embed(query)
        result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.user_id == user_id)
        )
        rows = result.scalars().all()
        return self._rank(rows, query_vec, k)

    # ── deletion ─────────────────────────────────────────────────────────────

    async def delete_session_chunks(self, session_id: str, db: AsyncSession) -> int:
        result = await db.execute(
            delete(DocumentChunk)
            .where(DocumentChunk.session_id == session_id)
            .returning(DocumentChunk.id)
        )
        await db.commit()
        count = len(result.fetchall())
        logger.info(f"VectorStore: deleted {count} chunks for session={session_id}")
        return count

    def delete_session_chunks_sync(self, session_id: str, db) -> int:
        result = db.execute(
            delete(DocumentChunk).where(DocumentChunk.session_id == session_id)
        )
        db.commit()
        count = result.rowcount
        logger.info(f"VectorStore: deleted {count} chunks for session={session_id}")
        return count

    async def delete_document_chunks(self, document_id: str, db: AsyncSession) -> int:
        result = await db.execute(
            delete(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .returning(DocumentChunk.id)
        )
        await db.commit()
        count = len(result.fetchall())
        logger.info(f"VectorStore: deleted {count} chunks for doc={document_id}")
        return count

    def delete_document_chunks_sync(self, document_id: str, db) -> int:
        result = db.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )
        db.commit()
        return result.rowcount

    # ── related sessions ─────────────────────────────────────────────────────

    async def find_related_sessions(
        self,
        session_id: str,
        user_id: int,
        n: int = 5,
        db: AsyncSession = None,
    ) -> List[dict]:
        """
        Find other sessions whose chunks are semantically close to this session's chunks.
        Returns list of {session_id, score} dicts sorted by descending score.
        """
        # Get a representative sample of this session's chunks
        result = await db.execute(
            select(DocumentChunk)
            .where(
                DocumentChunk.session_id == session_id,
                DocumentChunk.user_id == user_id,
            )
            .limit(5)
        )
        anchor_chunks = result.scalars().all()
        if not anchor_chunks:
            return []

        # Average embedding of anchor chunks
        anchor_vecs = [
            np.frombuffer(c.embedding, dtype=np.float32) for c in anchor_chunks
        ]
        anchor_vec = np.mean(anchor_vecs, axis=0).astype(np.float32)
        norm = np.linalg.norm(anchor_vec)
        if norm > 0:
            anchor_vec = anchor_vec / norm

        # Fetch all other sessions' chunks
        result = await db.execute(
            select(DocumentChunk).where(
                DocumentChunk.user_id == user_id,
                DocumentChunk.session_id != session_id,
            )
        )
        other_chunks = result.scalars().all()
        if not other_chunks:
            return []

        # Average per-session score
        session_scores: dict[str, list] = {}
        for chunk in other_chunks:
            vec = np.frombuffer(chunk.embedding, dtype=np.float32)
            score = float(anchor_vec @ vec)
            session_scores.setdefault(chunk.session_id, []).append(score)

        ranked = sorted(
            [
                {"session_id": sid, "score": float(np.mean(scores))}
                for sid, scores in session_scores.items()
            ],
            key=lambda x: x["score"],
            reverse=True,
        )
        return ranked[:n]

    # ── internal ─────────────────────────────────────────────────────────────

    def _rank(
        self, rows: list, query_vec: np.ndarray, k: int
    ) -> List[SearchResult]:
        if not rows:
            return []

        dim = len(query_vec)
        embeddings = []
        for r in rows:
            try:
                vec = np.frombuffer(r.embedding, dtype=np.float32)
                if len(vec) == dim:
                    embeddings.append(vec)
                else:
                    embeddings.append(np.zeros(dim, dtype=np.float32))
            except Exception:
                embeddings.append(np.zeros(dim, dtype=np.float32))

        mat = np.stack(embeddings)            # (N, dim)
        scores = mat @ query_vec              # (N,) — dot product = cosine sim
        top_k_idx = np.argsort(scores)[::-1][:k]

        results = []
        for idx in top_k_idx:
            row = rows[idx]
            try:
                pages = json.loads(row.pages or "[]")
            except Exception:
                pages = []
            results.append(SearchResult(
                chunk_text=row.chunk_text,
                pages=pages,
                document_id=row.document_id,
                score=float(scores[idx]),
                chunk_index=row.chunk_index,
            ))
        return results
