"""
services/llm.py — Async LLM service.  No LangChain, no threading.

Provider chain: OpenRouter → OpenAI → Gemini (auto-detected from env vars).
All async methods use openai.AsyncOpenAI.
stream_sync() is a sync generator kept for the Explore Hub (explore.py router).
"""

import logging
import os
from typing import Iterator, List, Optional

logger = logging.getLogger(__name__)

# ── OR aliases (shorthand model IDs → OpenRouter paths) ─────────────────────
_OR_ALIASES: dict = {
    "gpt-4o":            "openai/gpt-4o",
    "gpt-4o-mini":       "openai/gpt-4o-mini",
    "gemini-2.0-flash":  "google/gemini-2.0-flash-exp:free",
    "gemini-3-flash":    "google/gemini-3-flash-preview",
    "gemini-3.1-pro":    "google/gemini-3.1-pro-preview",
    "grok-3":            "x-ai/grok-3",
    "grok-3-mini":       "x-ai/grok-3-mini",
    "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
    "claude-sonnet-4.5": "anthropic/claude-sonnet-4.5",
    "claude-3-haiku":    "anthropic/claude-3-haiku",
}

_NO_TOOLS_MODELS = frozenset({
    "DeepSeek-R1", "DeepSeek-V3", "o1", "o1-mini",
    "deepseek-r1", "deepseek-v3",
    "deepseek/deepseek-r1",
})


def _detect_provider() -> str:
    p = os.getenv("AI_PROVIDER", "").lower()
    if p in ("openrouter", "gemini", "openai"):
        return p
    if os.getenv("OPENROUTER_API_KEY"):
        return "openrouter"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
        return "gemini"
    return "openai"


AI_PROVIDER = _detect_provider()
logger.info("LLMService: provider=%s", AI_PROVIDER)


class LLMService:
    """Async LLM calls.  Instantiate once as a module-level singleton."""

    def __init__(self):
        self._provider = AI_PROVIDER
        self._async_client = None   # openai.AsyncOpenAI — lazy init
        self._sync_client = None    # openai.OpenAI — lazy init (for stream_sync)
        self._gemini_configured = False
        self._genai = None

    # ── Resolve model ID ─────────────────────────────────────────────────────

    def resolve_model(self, model_id: Optional[str]) -> str:
        # Treat None, empty string, and the literal strings "null"/"none" as missing
        if not model_id or (isinstance(model_id, str) and model_id.strip().lower() in ("null", "none")):
            return self._default_model()
        if self._provider == "openrouter":
            if "/" in model_id:
                return model_id  # already a full path
            return _OR_ALIASES.get(model_id, model_id)
        return model_id

    def _default_model(self) -> str:
        def _env(var: str, fallback: str) -> str:
            v = os.getenv(var, "").strip()
            # Treat empty string and literal "null"/"none" (common .env mistake) as unset
            return fallback if not v or v.lower() in ("null", "none") else v

        if self._provider == "openrouter":
            return _env("OPENROUTER_CHAT_MODEL", "openai/gpt-4o")
        if self._provider == "gemini":
            return _env("GEMINI_CHAT_MODEL", "gemini-2.0-flash")
        return _env("OPENAI_CHAT_MODEL", "gpt-4o")

    # ── Async chat ───────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: List[dict],
        model: Optional[str] = None,
        tools: Optional[list] = None,
        tool_choice=None,
    ):
        """
        Send a chat request and return the raw response object.
        Falls back to plain completion if tool_choice call fails.
        """
        resolved = self.resolve_model(model)
        if not resolved:
            raise ValueError(
                f"LLMService.chat: could not resolve a valid model ID "
                f"(provider={self._provider})"
            )

        if self._provider == "gemini" and not self._is_openrouter_model(resolved):
            return await self._chat_gemini(messages, resolved, tools, tool_choice)

        client = self._get_async_client()
        kwargs = {"model": resolved, "messages": messages}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice or "auto"

        # First attempt
        try:
            resp = await client.chat.completions.create(**kwargs)
            return resp
        except Exception as e:
            if tools:
                logger.warning(
                    "tool-calling failed model=%s: %s — retrying without tools", resolved, e
                )
                try:
                    resp = await client.chat.completions.create(
                        model=resolved, messages=messages
                    )
                    return resp
                except Exception as e2:
                    logger.error("plain fallback also failed model=%s: %s", resolved, e2)
                    raise
            raise

    async def simple_response(
        self, prompt: str, model: Optional[str] = None
    ) -> str:
        """Single-turn completion. Returns the response text."""
        messages = [{"role": "user", "content": prompt}]
        resp = await self.chat(messages, model=model)
        return self._extract_content(resp)

    # ── Sync streaming (explore router only) ────────────────────────────────

    def stream_sync(
        self, messages: List[dict], model: Optional[str] = None
    ) -> Iterator[str]:
        """
        Sync streaming generator that yields text chunks.
        Kept sync because explore.py uses it in a sync FastAPI route.
        """
        resolved = self.resolve_model(model)

        if self._provider == "gemini" and not self._is_openrouter_model(resolved):
            yield from self._stream_gemini(messages, resolved)
            return

        client = self._get_sync_client()
        stream = client.chat.completions.create(
            model=resolved, messages=messages, stream=True, max_tokens=2048
        )
        for chunk in stream:
            text = getattr(chunk.choices[0].delta, "content", None) or ""
            if text:
                yield text

    # ── OpenAI/OpenRouter client helpers ─────────────────────────────────────

    def _get_async_client(self):
        if self._async_client is None:
            import openai

            if self._provider == "openrouter":
                api_key = os.getenv("OPENROUTER_API_KEY")
                if not api_key:
                    raise ValueError("OPENROUTER_API_KEY is required")
                self._async_client = openai.AsyncOpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=api_key,
                )
            else:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY is required")
                self._async_client = openai.AsyncOpenAI(api_key=api_key)
        return self._async_client

    def _get_sync_client(self):
        if self._sync_client is None:
            import openai

            if self._provider == "openrouter":
                api_key = os.getenv("OPENROUTER_API_KEY")
                if not api_key:
                    raise ValueError("OPENROUTER_API_KEY is required")
                self._sync_client = openai.OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=api_key,
                )
            else:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY is required")
                self._sync_client = openai.OpenAI(api_key=api_key)
        return self._sync_client

    def _is_openrouter_model(self, model_id: str) -> bool:
        return self._provider == "openrouter" or "/" in model_id

    # ── Gemini helpers ────────────────────────────────────────────────────────

    def _get_genai(self):
        if not self._gemini_configured:
            import google.generativeai as genai
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY is required for Gemini")
            genai.configure(api_key=api_key)
            self._genai = genai
            self._gemini_configured = True
        return self._genai

    async def _chat_gemini(self, messages, model, tools, tool_choice):
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._chat_gemini_sync, messages, model, tools, tool_choice
        )

    def _chat_gemini_sync(self, messages, model, tools, tool_choice):
        """Minimal Gemini sync chat that returns an OpenAI-compatible response-like object."""
        genai = self._get_genai()
        sys_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_msgs = [m for m in messages if m["role"] in ("user", "assistant")]
        gmodel = genai.GenerativeModel(
            model_name=model,
            system_instruction=sys_msg if sys_msg else None,
        )
        query = user_msgs[-1]["content"] if user_msgs else ""
        response = gmodel.generate_content(query)
        text = response.text or ""

        class _FakeMessage:
            content = text
            tool_calls = None

        class _FakeChoice:
            message = _FakeMessage()
            finish_reason = "stop"

        class _FakeResp:
            choices = [_FakeChoice()]

        return _FakeResp()

    def _stream_gemini(self, messages, model) -> Iterator[str]:
        genai = self._get_genai()
        sys_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_msgs = [m["content"] for m in messages if m["role"] in ("user", "assistant")]
        gmodel = genai.GenerativeModel(
            model_name=model,
            system_instruction=sys_msg if sys_msg else None,
        )
        query = user_msgs[-1] if user_msgs else ""
        response = gmodel.generate_content(
            query, stream=True, generation_config={"max_output_tokens": 2048}
        )
        for chunk in response:
            text = getattr(chunk, "text", "") or ""
            if text:
                yield text

    # ── Content extraction ────────────────────────────────────────────────────

    def _extract_content(self, response) -> str:
        """Extract text content from a response (OpenAI format or Gemini adapter)."""
        if hasattr(response, "choices"):
            return response.choices[0].message.content or ""
        # Gemini adapter
        if hasattr(response, "text"):
            return response.text or ""
        return str(response)
