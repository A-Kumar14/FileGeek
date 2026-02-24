"""
services/embeddings.py — Embedding service without LangChain.

Auto-detects provider:
  OPENAI_API_KEY  → text-embedding-3-small (1536 dims)
  GOOGLE_API_KEY  → gemini-embedding-001   (768 dims)

Vectors are L2-normalised at return time, so cosine-similarity == dot-product.
"""

import logging
import os
import time
from typing import List

import numpy as np

logger = logging.getLogger(__name__)


def _normalize(vec: np.ndarray) -> np.ndarray:
    """L2-normalise a 1-D float32 array in-place and return it."""
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.astype(np.float32)


class EmbeddingService:
    """Provider-agnostic embedding service.  No LangChain, no ChromaDB."""

    def __init__(self):
        self._provider = None   # lazily resolved on first call
        self._dim = None
        self._client = None     # openai.OpenAI or None

    # ── public API ──────────────────────────────────────────────────────────

    def embed(self, text: str) -> np.ndarray:
        """Return a normalised float32 vector for *text*."""
        results = self.embed_batch([text])
        return results[0]

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Return a list of normalised float32 vectors for *texts*."""
        if not texts:
            return []
        provider = self._get_provider()
        if provider == "openai":
            return self._embed_openai(texts)
        elif provider == "gemini":
            return self._embed_gemini(texts)
        else:
            raise RuntimeError(
                "No embedding provider configured. "
                "Set OPENAI_API_KEY or GOOGLE_API_KEY."
            )

    @property
    def dimensions(self) -> int:
        """Vector dimensions for the active provider."""
        self._get_provider()  # ensure resolved
        return self._dim or 1536

    # ── provider resolution ─────────────────────────────────────────────────

    def _get_provider(self) -> str:
        if self._provider:
            return self._provider

        if os.getenv("OPENAI_API_KEY"):
            self._provider = "openai"
            self._dim = 1536
            import openai
            self._client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            logger.info("EmbeddingService: using OpenAI text-embedding-3-small (1536d)")
        elif os.getenv("GOOGLE_API_KEY"):
            self._provider = "gemini"
            self._dim = 768
            logger.info("EmbeddingService: using Gemini embedding-001 (768d)")
        else:
            # Fall back to a zero-vector stub so the app doesn't crash completely
            self._provider = "none"
            self._dim = 1536
            logger.warning(
                "EmbeddingService: no API key found — returning zero vectors. "
                "Set OPENAI_API_KEY or GOOGLE_API_KEY."
            )

        return self._provider

    # ── OpenAI ──────────────────────────────────────────────────────────────

    def _embed_openai(self, texts: List[str]) -> List[np.ndarray]:
        BATCH = 200
        results: List[np.ndarray] = []
        for i in range(0, len(texts), BATCH):
            batch = texts[i : i + BATCH]
            for attempt in range(4):
                try:
                    resp = self._client.embeddings.create(
                        model="text-embedding-3-small",
                        input=batch,
                    )
                    for item in resp.data:
                        vec = np.array(item.embedding, dtype=np.float32)
                        results.append(_normalize(vec))
                    break
                except Exception as exc:
                    wait = 2 ** attempt
                    logger.warning(
                        f"OpenAI embed attempt {attempt + 1} failed: {exc}. "
                        f"Retrying in {wait}s."
                    )
                    time.sleep(wait)
                    if attempt == 3:
                        raise
        return results

    # ── Gemini ──────────────────────────────────────────────────────────────

    def _embed_gemini(self, texts: List[str]) -> List[np.ndarray]:
        """
        Uses the Gemini REST batchEmbedContents endpoint directly —
        no LangChain, no google-generativeai SDK required beyond `requests`.
        """
        import requests

        api_key = os.getenv("GOOGLE_API_KEY")
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-embedding-001:batchEmbedContents?key={api_key}"
        )
        BATCH = 100
        results: List[np.ndarray] = []

        for i in range(0, len(texts), BATCH):
            batch = texts[i : i + BATCH]
            payload = {
                "requests": [
                    {
                        "model": "models/gemini-embedding-001",
                        "content": {"parts": [{"text": t}]},
                    }
                    for t in batch
                ]
            }
            for attempt in range(4):
                try:
                    resp = requests.post(url, json=payload, timeout=60)
                    resp.raise_for_status()
                    data = resp.json()
                    for emb in data.get("embeddings", []):
                        vec = np.array(emb["values"], dtype=np.float32)
                        results.append(_normalize(vec))
                    break
                except Exception as exc:
                    wait = 2 ** attempt
                    logger.warning(
                        f"Gemini embed attempt {attempt + 1} failed: {exc}. "
                        f"Retrying in {wait}s."
                    )
                    time.sleep(wait)
                    if attempt == 3:
                        raise

        return results
