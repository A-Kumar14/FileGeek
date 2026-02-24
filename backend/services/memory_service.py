"""
services/memory_service.py — SQLite-backed user memory (replaces ChromaDB user_memory).

Async methods (suffix _async) for FastAPI routes.
Sync methods (no suffix) for backward compat — used by chat.py via run_in_executor.
"""

import json
import logging
from datetime import datetime
from typing import List, Optional

import numpy as np
from sqlalchemy import select, delete

from models_async import UserMemoryEntry

logger = logging.getLogger(__name__)


class MemoryService:
    """Long-term per-user memory stored in SQLite.  No ChromaDB."""

    def __init__(self, embedding_service):
        self._emb = embedding_service

    # ── Store interaction ────────────────────────────────────────────────────

    def store_interaction(
        self,
        user_id: int,
        question: str,
        answer: str,
        feedback: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        """Sync — embeds the summary and writes it to SQLite via SyncSession."""
        summary = f"Q: {question[:200]}\nA: {answer[:300]}"
        if feedback:
            summary += f"\nFeedback: {feedback}"

        try:
            vec = self._emb.embed(summary)
            from celery_db import SyncSession

            with SyncSession() as db:
                entry = UserMemoryEntry(
                    user_id=user_id,
                    session_id=session_id,
                    summary=summary,
                    embedding=vec.tobytes(),
                    feedback=feedback,
                )
                db.add(entry)
                db.commit()
        except Exception as e:
            logger.warning("MemoryService.store_interaction failed user=%s: %s", user_id, e)

    async def store_interaction_async(
        self,
        user_id: int,
        question: str,
        answer: str,
        feedback: Optional[str] = None,
        session_id: Optional[str] = None,
        db=None,  # AsyncSession
    ):
        """Async version for FastAPI routes."""
        import asyncio

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.store_interaction(user_id, question, answer, feedback, session_id),
        )

    # ── Retrieve memory ──────────────────────────────────────────────────────

    def retrieve_relevant_memory(
        self, user_id: int, question: str, n: int = 3
    ) -> List[str]:
        """Sync — returns list of summary strings."""
        try:
            from celery_db import SyncSession

            q_vec = self._emb.embed(question)

            with SyncSession() as db:
                result = db.execute(
                    select(UserMemoryEntry).where(UserMemoryEntry.user_id == user_id)
                )
                rows = result.scalars().all()

            if not rows:
                return []

            return self._rank_memories(rows, q_vec, n)
        except Exception as e:
            logger.warning(
                "MemoryService.retrieve_relevant_memory failed user=%s: %s", user_id, e
            )
            return []

    async def retrieve_relevant_memory_async(
        self, user_id: int, question: str, n: int = 3, db=None
    ) -> List[str]:
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.retrieve_relevant_memory, user_id, question, n
        )

    # ── User preferences ─────────────────────────────────────────────────────

    def get_user_preferences(self, user_id: int) -> str:
        """Sync — derive preference hints from thumbs-up/down history."""
        try:
            from celery_db import SyncSession

            with SyncSession() as db:
                pos_result = db.execute(
                    select(UserMemoryEntry).where(
                        UserMemoryEntry.user_id == user_id,
                        UserMemoryEntry.feedback == "up",
                    ).limit(20)
                )
                pos_rows = pos_result.scalars().all()

                neg_result = db.execute(
                    select(UserMemoryEntry).where(
                        UserMemoryEntry.user_id == user_id,
                        UserMemoryEntry.feedback == "down",
                    ).limit(20)
                )
                neg_rows = neg_result.scalars().all()

            if not pos_rows and not neg_rows:
                return ""

            prefs = []
            if pos_rows:
                snippets = [r.summary[:80] for r in pos_rows[:5]]
                prefs.append(f"User liked responses like: {'; '.join(snippets)}")
            if neg_rows:
                snippets = [r.summary[:80] for r in neg_rows[:5]]
                prefs.append(f"User disliked responses like: {'; '.join(snippets)}")

            return " | ".join(prefs)
        except Exception as e:
            logger.warning(
                "MemoryService.get_user_preferences failed user=%s: %s", user_id, e
            )
            return ""

    async def get_user_preferences_async(self, user_id: int) -> str:
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.get_user_preferences, user_id)

    # ── Internal ─────────────────────────────────────────────────────────────

    def _rank_memories(self, rows, query_vec: np.ndarray, n: int) -> List[str]:
        dim = len(query_vec)
        embeddings = []
        valid_rows = []
        for row in rows:
            try:
                vec = np.frombuffer(row.embedding, dtype=np.float32)
                if len(vec) == dim:
                    embeddings.append(vec)
                    valid_rows.append(row)
            except Exception:
                pass

        if not embeddings:
            return [r.summary for r in rows[:n]]

        mat = np.stack(embeddings)
        scores = mat @ query_vec
        top_idx = np.argsort(scores)[::-1][:n]
        return [valid_rows[i].summary for i in top_idx]
