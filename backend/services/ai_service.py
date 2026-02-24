"""
services/ai_service.py — Thin shim for backward compatibility.

The real logic now lives in:
  services/llm.py        (LLM calls)
  services/chat_engine.py (agentic loop)
  services/embeddings.py  (embeddings)

This class wraps those services with the OLD synchronous API so that
existing callers (tools.py, explore.py, document_tasks.py) need zero changes.

IMPORTANT:
  answer_with_tools() and generate_chat_title() must NOT be called from
  within a running event loop.  They use asyncio.run() internally.
  They ARE called from routers/chat.py but only indirectly — the chat router
  now calls chat_engine.generate_response() directly (async).

  answer_from_context() calls asyncio.run(llm.simple_response()) which is
  safe because it is called either:
    a) From Celery workers (no event loop)
    b) From run_in_executor() inside chat_engine (thread pool — no event loop)
"""

import asyncio
import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Provider detection (kept for RESPONSE_MODEL class attribute) ─────────────
_provider_env = os.getenv("AI_PROVIDER", "").lower()
if _provider_env in ("openrouter", "gemini", "openai"):
    AI_PROVIDER = _provider_env
elif os.getenv("OPENROUTER_API_KEY"):
    AI_PROVIDER = "openrouter"
elif os.getenv("OPENAI_API_KEY"):
    AI_PROVIDER = "openai"
elif os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
    AI_PROVIDER = "gemini"
else:
    AI_PROVIDER = "openai"

# ── System prompt (kept for explore.py) ─────────────────────────────────────
DEFAULT_SYSTEM_PROMPT = (
    "You are FileGeek — a brilliant analytical AI assistant who helps users deeply "
    "understand their documents.\n"
    "- Structured and clear: always use Markdown (headers, lists, bold, code blocks)\n"
    "- Adaptive depth: concise for quick lookups; thorough with examples for concepts\n"
    "- Math formatting: Always wrap mathematical variables, expressions, and formulas in "
    "$...$ for inline math and $$...$$ for block math.\n"
    "- Never fabricate — if info is absent from context, say so\n"
)

FILE_TYPE_MODIFIERS = {
    "pdf":   "\nThe document is a PDF. Pay attention to page references and structure.",
    "docx":  "\nThe document is a Word file. Focus on textual content and formatting.",
    "txt":   "\nThe document is a plain text file. Focus on the raw content.",
    "image": (
        "\nThe content includes an image. You can see it directly. Describe what you "
        "observe and answer the user's question based on the visual content."
    ),
}


def get_system_prompt(file_type: str = "pdf") -> str:
    return DEFAULT_SYSTEM_PROMPT + FILE_TYPE_MODIFIERS.get(file_type, "")


class AIService:
    """Backward-compat shim wrapping new async services."""

    # Class-level attributes referenced by chat.py
    if AI_PROVIDER == "gemini":
        GEMINI_RESPONSE_MODEL = os.getenv("GEMINI_RESPONSE_MODEL", "gemini-2.0-flash")
        RESPONSE_MODEL = GEMINI_RESPONSE_MODEL
    elif AI_PROVIDER == "openrouter":
        OPENROUTER_RESPONSE_MODEL = os.getenv("OPENROUTER_RESPONSE_MODEL", "openai/gpt-4o")
        RESPONSE_MODEL = OPENROUTER_RESPONSE_MODEL
    else:
        OPENAI_RESPONSE_MODEL = os.getenv("OPENAI_RESPONSE_MODEL", "gpt-4o")
        RESPONSE_MODEL = OPENAI_RESPONSE_MODEL

    # Shorthand OR aliases (used by chat.py for model_override resolution)
    _OR_ALIASES: dict = {
        "gpt-4o":            "openai/gpt-4o",
        "gpt-4o-mini":       "openai/gpt-4o-mini",
        "gemini-2.0-flash":  "google/gemini-2.0-flash-exp:free",
        "gemini-3-flash":    "google/gemini-3-flash-preview",
        "grok-3":            "x-ai/grok-3",
        "grok-3-mini":       "x-ai/grok-3-mini",
        "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
        "claude-sonnet-4.5": "anthropic/claude-sonnet-4.5",
    }

    def __init__(self):
        self.provider = AI_PROVIDER
        # Lazy references to registry singletons — set after registry.py runs
        self._llm = None
        self._chat_engine = None
        self._embedding_service = None

    def _get_llm(self):
        if self._llm is None:
            from services.registry import llm_service
            self._llm = llm_service
        return self._llm

    def _get_chat_engine(self):
        if self._chat_engine is None:
            from services.registry import chat_engine
            self._chat_engine = chat_engine
        return self._chat_engine

    def _get_emb(self):
        if self._embedding_service is None:
            from services.registry import embedding_service
            self._embedding_service = embedding_service
        return self._embedding_service

    # ── answer_from_context ─────────────────────────────────────────────────

    def answer_from_context(
        self,
        context_chunks: List[str],
        question: str,
        chat_history: List[Dict],
        model_override: str = None,
        persona: str = "academic",
        file_type: str = "pdf",
        image_paths: Optional[List[str]] = None,
    ) -> Optional[str]:
        """Sync — safe to call from Celery workers and run_in_executor threads."""
        context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
        system = get_system_prompt(file_type)
        text_part = (
            f"Context from the document:\n\n{context}\n\n---\n\nQuestion: {question}"
            if context else question
        )

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": text_part},
        ]

        try:
            llm = self._get_llm()
            return asyncio.run(llm.simple_response(text_part, model=model_override))
        except RuntimeError as exc:
            if "This event loop is already running" in str(exc):
                # Fallback for edge cases — use sync OpenAI client directly
                logger.warning("answer_from_context: event loop conflict, using sync client")
                return self._sync_fallback(messages, model_override)
            raise
        except Exception as exc:
            logger.error("answer_from_context failed: %s", exc)
            return None

    def _sync_fallback(self, messages, model_override=None):
        """Direct sync OpenAI call when asyncio.run() can't be used."""
        try:
            import openai
            if AI_PROVIDER == "openrouter":
                client = openai.OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=os.getenv("OPENROUTER_API_KEY"),
                )
                model = model_override or os.getenv("OPENROUTER_CHAT_MODEL", "openai/gpt-4o")
            else:
                client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                model = model_override or os.getenv("OPENAI_CHAT_MODEL", "gpt-4o")
            resp = client.chat.completions.create(model=model, messages=messages)
            return resp.choices[0].message.content
        except Exception as exc:
            logger.error("_sync_fallback failed: %s", exc)
            return None

    # ── answer_with_tools (kept for compat — chat.py no longer calls this) ──

    def answer_with_tools(
        self,
        question: str,
        chat_history: List[Dict],
        tool_executor,
        session_id: str,
        user_id: int,
        file_type: str = "pdf",
        model_override: str = None,
        memory_context: str = "",
        preference_context: str = "",
        has_documents: bool = False,
        on_progress=None,
    ) -> Dict:
        """
        Sync entry point kept for any legacy callers.
        chat.py now calls chat_engine.generate_response() directly.
        """
        engine = self._get_chat_engine()
        try:
            return asyncio.run(
                engine.generate_response(
                    question=question,
                    session_id=session_id,
                    user_id=user_id,
                    chat_history=chat_history,
                    db=None,
                    model=model_override,
                    has_documents=has_documents,
                    memory_context=memory_context,
                    preference_context=preference_context,
                    file_type=file_type,
                    on_progress=on_progress,
                )
            )
        except Exception as exc:
            logger.error("answer_with_tools failed: %s", exc)
            return {
                "answer": "I encountered an error processing your request.",
                "sources": [], "artifacts": [], "suggestions": [],
            }

    # ── generate_chat_title ─────────────────────────────────────────────────

    def generate_chat_title(self, first_message: str) -> str:
        try:
            engine = self._get_chat_engine()
            return asyncio.run(engine.generate_chat_title(first_message))
        except Exception as exc:
            logger.error("generate_chat_title failed: %s", exc)
            return "New Chat"

    # ── get_embeddings ──────────────────────────────────────────────────────

    def get_embeddings(self, text_list: List[str]) -> List[List[float]]:
        if not text_list:
            return []
        emb_svc = self._get_emb()
        vecs = emb_svc.embed_batch(text_list)
        return [v.tolist() for v in vecs]

    # ── explore_the_web (sync streaming generator — unchanged) ──────────────

    def explore_the_web(self, query: str):
        """
        Search-Augmented Generation streaming generator for the Explore Hub.
        Yields SSE-formatted strings.
        """
        import json as _json
        from services import search_service

        sources: list[dict] = []

        try:
            results = search_service.web_search(query, max_results=8)
            urls = [r["url"] for r in results if r.get("url")]
            scraped = search_service.scrape_urls(urls, max_pages=5)
            context_block, sources = search_service.build_context(results, scraped)
        except Exception as exc:
            logger.error("explore_the_web.search_failed: %s", exc)
            context_block = ""
            sources = []

        system_prompt = (
            "You are FileGeek Explore — an AI research assistant. "
            "You have been given web search results below. Use them to answer the user's question. "
            "You MUST cite sources using inline notation like [1], [2], [3] that correspond exactly "
            "to the numbered sources in the context. Be thorough and well-structured using Markdown.\n\n"
            "--- WEB CONTEXT ---\n"
            f"{context_block}\n"
            "--- END CONTEXT ---"
        )

        if sources:
            for src in sources:
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(src["url"]).netloc.replace("www.", "")
                    src["favicon"] = f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
                except Exception:
                    src["favicon"] = ""
            yield f"data: {_json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ]
            llm = self._get_llm()
            for text in llm.stream_sync(messages):
                yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error("explore_the_web.stream_failed: %s", exc)
            yield f"data: {_json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    # ── Compat properties ────────────────────────────────────────────────────

    def validate_file(self, filepath: str) -> bool:
        try:
            if not os.path.exists(filepath):
                return False
            if os.path.getsize(filepath) > 10 * 1024 * 1024:
                return False
            allowed = (".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg")
            return filepath.lower().endswith(allowed)
        except Exception:
            return False
