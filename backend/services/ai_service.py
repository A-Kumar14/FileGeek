import os
import logging
from typing import List, Dict, Optional

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_core.embeddings import Embeddings as LCEmbeddings

from services.providers.gemini_provider import GeminiV1Embeddings, answer_gemini, agentic_gemini
from services.providers.openai_provider import answer_openai, agentic_openai
# NOTE: langchain_google_genai is NOT used for embeddings — its default v1beta endpoint
# dropped support for text-embedding-004. We use a direct REST call to the stable v1 API.

load_dotenv()

logger = logging.getLogger(__name__)

# ── Provider detection ──────────────────────────────────────────────────
# Set AI_PROVIDER=gemini or AI_PROVIDER=openai in .env (default: auto-detect)

_provider = os.getenv("AI_PROVIDER", "").lower()


# GeminiV1Embeddings, answer_gemini, agentic_gemini, answer_openai, agentic_openai
# are imported from services.providers.* above.


if _provider == "openrouter":
    AI_PROVIDER = "openrouter"
elif _provider == "gemini":
    AI_PROVIDER = "gemini"
elif _provider == "openai":
    AI_PROVIDER = "openai"
elif os.getenv("OPENROUTER_API_KEY"):
    AI_PROVIDER = "openrouter"
elif os.getenv("OPENAI_API_KEY"):
    AI_PROVIDER = "openai"
elif os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
    AI_PROVIDER = "gemini"
else:
    AI_PROVIDER = "openai"  # will raise a clear error at first use if no key

logger.info(f"AI provider: {AI_PROVIDER}")

# Lazy imports based on provider
genai = None
OpenAI = None

if AI_PROVIDER == "gemini":
    import google.generativeai as genai  # noqa: F811



# ── Persona definitions (Removed, using default system prompt) ─────────
DEFAULT_SYSTEM_PROMPT = (
    "You are FileGeek — a brilliant analytical AI assistant who helps users deeply "
    "understand their documents.\n"
    "- Structured and clear: always use Markdown (headers, lists, bold, code blocks)\n"
    "- Adaptive depth: concise for quick lookups; thorough with examples for concepts\n"
    "- Math formatting: Always wrap mathematical variables, expressions, and formulas in $...$ for inline math and $$...$$ for block math. Do not use plain parentheses for math.\n"
    "- Never fabricate — if info is absent from context, say so\n"
)

FILE_TYPE_MODIFIERS = {
    "pdf": "\nThe document is a PDF. Pay attention to page references and structure.",
    "docx": "\nThe document is a Word file. Focus on textual content and formatting.",
    "txt": "\nThe document is a plain text file. Focus on the raw content.",
    "image": (
        "\nThe content includes an image. You can see it directly. Describe what you "
        "observe and answer the user's question based on the visual content."
    ),
}

def get_system_prompt(file_type: str = "pdf") -> str:
    modifier = FILE_TYPE_MODIFIERS.get(file_type, "")
    return DEFAULT_SYSTEM_PROMPT + modifier


# ── AI Service (dual-provider: Gemini + OpenAI) ────────────────────────

class AIService:
    # Gemini models
    GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.0-flash")
    GEMINI_RESPONSE_MODEL = os.getenv("GEMINI_RESPONSE_MODEL", "gemini-2.0-flash")
    # Use the bare model name (without 'models/' prefix); GeminiV1Embeddings adds it.
    # Override with GEMINI_EMBEDDING_MODEL env var to switch models.
    # Only 'models/gemini-embedding-001' is available by default on free-tier API keys (v1beta).
    # If you have access to text-embedding-004, set:
    #   GEMINI_EMBEDDING_MODEL=text-embedding-004  GEMINI_EMBEDDING_API_VERSION=v1
    GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
    GEMINI_EMBEDDING_API_VERSION = os.getenv("GEMINI_EMBEDDING_API_VERSION", "v1beta")

    # OpenAI models
    OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o")
    OPENAI_RESPONSE_MODEL = os.getenv("OPENAI_RESPONSE_MODEL", "gpt-4o")
    OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # OpenRouter models (uses OpenAI-compatible API at openrouter.ai/api/v1)
    # Model IDs use the "provider/model-name" format e.g. "openai/gpt-4o"
    OPENROUTER_CHAT_MODEL = os.getenv("OPENROUTER_CHAT_MODEL", "openai/gpt-4o")
    OPENROUTER_RESPONSE_MODEL = os.getenv("OPENROUTER_RESPONSE_MODEL", "openai/gpt-4o")

    # Map shorthand model IDs → OpenRouter full paths when provider is openrouter
    _OR_ALIASES: dict = {
        "gpt-4o":           "openai/gpt-4o",
        "gpt-4o-mini":      "openai/gpt-4o-mini",
        "gemini-2.0-flash": "google/gemini-2.0-flash-exp:free",
        "grok-3":           "x-ai/grok-3",
        "grok-3-mini":      "x-ai/grok-3-mini",
        "claude-3.5-sonnet":"anthropic/claude-3.5-sonnet",
        "claude-3-haiku":   "anthropic/claude-3-haiku",
    }

    # Provider-aware aliases
    if AI_PROVIDER == "gemini":
        CHAT_MODEL = GEMINI_CHAT_MODEL
        RESPONSE_MODEL = GEMINI_RESPONSE_MODEL
    elif AI_PROVIDER == "openrouter":
        CHAT_MODEL = OPENROUTER_CHAT_MODEL
        RESPONSE_MODEL = OPENROUTER_RESPONSE_MODEL
    else:  # openai
        CHAT_MODEL = OPENAI_CHAT_MODEL
        RESPONSE_MODEL = OPENAI_RESPONSE_MODEL

    def __init__(self):
        self.provider = AI_PROVIDER
        self._openai_client_instance = None
        self._gemini_configured = False
        self._genai_module = None

        if self.provider == "gemini":
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not api_key:
                logger.warning("Gemini API key not found. Embeddings will fail if called.")
            else:
                # We do not globally configure genai here to avoid crashing if it's missing but not used
                self.embeddings = GeminiV1Embeddings(
                    api_key=api_key,
                    model=self.GEMINI_EMBEDDING_MODEL,
                    api_version=self.GEMINI_EMBEDDING_API_VERSION,
                )
        elif self.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.warning("OPENAI API key not found. Embeddings will fail if called.")
            else:
                self.embeddings = OpenAIEmbeddings(
                    model=self.OPENAI_EMBEDDING_MODEL,
                    openai_api_key=api_key,
                )
        elif self.provider == "openrouter":
            # OpenRouter has no embeddings endpoint — use OPENAI_API_KEY or GOOGLE_API_KEY
            openai_key = os.getenv("OPENAI_API_KEY")
            gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if openai_key:
                self.embeddings = OpenAIEmbeddings(
                    model=self.OPENAI_EMBEDDING_MODEL,
                    openai_api_key=openai_key,
                )
            elif gemini_key:
                self.embeddings = GeminiV1Embeddings(
                    api_key=gemini_key,
                    model=self.GEMINI_EMBEDDING_MODEL,
                    api_version=self.GEMINI_EMBEDDING_API_VERSION,
                )
            else:
                logger.warning("No embedding provider for OpenRouter. Provide OPENAI_API_KEY or GOOGLE_API_KEY for embeddings.")
                self.embeddings = None
        else:
            logger.warning("No embedding provider configured. Set OPENAI_API_KEY or GOOGLE_API_KEY.")
            self.embeddings = None

    @property
    def openai_client(self):
        if self._openai_client_instance is None:
            from openai import OpenAI as _OpenAI

            if self.provider == "openrouter":
                api_key = os.getenv("OPENROUTER_API_KEY")
                if not api_key:
                    raise ValueError("OPENROUTER_API_KEY environment variable is required to use OpenRouter models.")
                self._openai_client_instance = _OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=api_key,
                )
            else:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY environment variable is required to use OpenAI models.")
                self._openai_client_instance = _OpenAI(api_key=api_key)

        return self._openai_client_instance

    def _resolve_model(self, model_id: str | None) -> str | None:
        """Map shorthand model IDs to OpenRouter full paths when provider is openrouter."""
        if not model_id or self.provider != "openrouter":
            return model_id
        if "/" in model_id:
            return model_id  # Already a full OpenRouter path
        return self._OR_ALIASES.get(model_id, model_id)

    def _get_fallback_clients(self, model_override: str | None = None) -> list:
        """Return ordered list of (openai_compatible_client, model_name) to try.

        Primary provider first; other providers appended as fallbacks if their
        API keys are present.  This lets the system automatically recover when
        a provider hits quota / rate limits.
        """
        from openai import OpenAI as _OAI

        attempts = []
        resolved_override = self._resolve_model(model_override)
        primary_model = resolved_override or self.CHAT_MODEL

        # ── Primary provider ──────────────────────────────────────────────────
        attempts.append((self.openai_client, primary_model))

        # ── OpenAI fallback (when primary is OpenRouter) ──────────────────────
        if self.provider == "openrouter":
            oai_key = os.getenv("OPENAI_API_KEY")
            if oai_key:
                attempts.append((_OAI(api_key=oai_key), "gpt-4o"))

        # ── OpenRouter fallback (when primary is OpenAI/Gemini) ───────────────
        if self.provider != "openrouter":
            or_key = os.getenv("OPENROUTER_API_KEY")
            if or_key:
                attempts.append((
                    _OAI(base_url="https://openrouter.ai/api/v1", api_key=or_key),
                    "openai/gpt-4o",
                ))

        return attempts

    @property
    def gemini_client(self):
        if not self._gemini_configured:
            import google.generativeai as _genai  # lazy import — works even if AI_PROVIDER=openai
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY (or GEMINI_API_KEY) environment variable is required to use Gemini models.")
            _genai.configure(api_key=api_key)
            self._genai_module = _genai
            self._gemini_configured = True
        return self._genai_module

    @property
    def client(self):
        """Backward compat: returns OpenAI client for TTS etc."""
        return self.openai_client

    # ── Answer from context ─────────────────────────────────────────────
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
        provider = self.provider
        if model_override:
            if "/" in model_override:
                provider = "openrouter"
            elif model_override.startswith("gpt") or model_override.startswith("o"):
                if self.provider != "openrouter":
                    provider = "openai"
            elif model_override.startswith("gemini"):
                if self.provider != "openrouter":
                    provider = "gemini"
            else:
                logger.warning(f"Unmapped model_override '{model_override}', falling back to {provider}")

        try:
            if provider == "gemini":
                # Ensure client is available
                _ = self.gemini_client
                return self._answer_gemini(
                    context_chunks, question, chat_history,
                    model_override, file_type, image_paths,
                )
            else:
                _ = self.openai_client
                return self._answer_openai(
                    context_chunks, question, chat_history,
                    model_override, file_type, image_paths,
                )
        except Exception as e:
            logger.error(f"Failed to use provider {provider}: {str(e)}. Falling back to default provider {self.provider}")
            
            # Fallback to default configured provider if custom override failed
            if provider != self.provider:
                try:
                    if self.provider == "gemini":
                        return self._answer_gemini(
                            context_chunks, question, chat_history,
                            None, file_type, image_paths, # Force default model
                        )
                    else:
                        return self._answer_openai(
                            context_chunks, question, chat_history,
                            None, file_type, image_paths,
                        )
                except Exception as fallback_e:
                    logger.error(f"Fallback generation failed: {str(fallback_e)}")
            
            return f"System Error: Unable to communicate with the AI provider. {str(e)}"

    # ── Gemini implementation ───────────────────────────────────────────
    def _answer_gemini(
        self,
        context_chunks: List[str],
        question: str,
        chat_history: List[Dict],
        model_override: str = None,
        file_type: str = "pdf",
        image_paths: Optional[List[str]] = None,
    ) -> Optional[str]:
        return answer_gemini(self, context_chunks, question, chat_history, model_override, file_type, image_paths)

    # ── OpenAI implementation ───────────────────────────────────────────
    def _answer_openai(
        self,
        context_chunks: List[str],
        question: str,
        chat_history: List[Dict],
        model_override: str = None,
        file_type: str = "pdf",
        image_paths: Optional[List[str]] = None,
    ) -> Optional[str]:
        return answer_openai(self, context_chunks, question, chat_history, model_override, file_type, image_paths)

    # ── Agentic answer with tool calling ──────────────────────────────
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
        """Agentic loop: send message, handle tool calls, return final answer + artifacts."""
        # Models known to not support function/tool calling — fall back to non-agentic flow.
        _NO_TOOLS_MODELS = {
            "DeepSeek-R1", "DeepSeek-V3", "o1", "o1-mini", "deepseek-r1", "deepseek-v3",
            "deepseek/deepseek-r1",  # OpenRouter full path
        }
        if model_override and model_override in _NO_TOOLS_MODELS:
            logger.info("model '%s' does not support tools — using non-agentic answer_from_context", model_override)
            return {
                "answer": (
                    f"[Model {model_override} does not support tool calling. "
                    "Please switch to Grok-3, GPT-4o, or Gemini 2.0 Flash for full document analysis.]"
                ),
                "sources": [],
                "artifacts": [],
                "suggestions": [],
                "message_id": None,
            }

        provider = self.provider
        if model_override:
            if "/" in model_override:
                provider = "openrouter"
            elif model_override.startswith("gpt") or model_override.startswith("o"):
                if self.provider != "openrouter":
                    provider = "openai"
            elif model_override.startswith("gemini"):
                if self.provider != "openrouter":
                    provider = "gemini"

        if provider == "gemini":
            return self._agentic_gemini(
                question, chat_history, tool_executor, session_id, user_id,
                file_type, model_override, memory_context, preference_context,
                has_documents, on_progress=on_progress,
            )
        else:
            # openai and openrouter both use the OpenAI-compatible agentic path
            return self._agentic_openai(
                question, chat_history, tool_executor, session_id, user_id,
                file_type, model_override, memory_context, preference_context,
                has_documents, on_progress=on_progress,
            )

    def _agentic_openai(
        self, question, chat_history, tool_executor, session_id, user_id,
        file_type, model_override, memory_context, preference_context,
        has_documents=False, on_progress=None,
    ) -> Dict:
        return agentic_openai(self, question, chat_history, tool_executor, session_id, user_id,
                              file_type, model_override, memory_context, preference_context,
                              has_documents, on_progress=on_progress)

    def _agentic_gemini(
        self, question, chat_history, tool_executor, session_id, user_id,
        file_type, model_override, memory_context, preference_context,
        has_documents=False, on_progress=None,
    ) -> Dict:
        return agentic_gemini(self, question, chat_history, tool_executor, session_id, user_id,
                              file_type, model_override, memory_context, preference_context,
                              has_documents, on_progress=on_progress)

    def _parse_response_extras(self, answer: str, tool_calls_log: list) -> tuple:
        """Extract sources from search_documents calls and suggestions from response."""
        import json
        import re

        sources = []
        for tc in tool_calls_log:
            if tc["tool"] == "search_documents" and "results" in tc.get("result_keys", []):
                pass  # Sources come from tool results embedded in the answer

        suggestions = []
        suggestion_match = re.search(r'```suggestions\s*\n(.*?)\n```', answer, re.DOTALL)
        if suggestion_match:
            try:
                suggestions = json.loads(suggestion_match.group(1))
            except json.JSONDecodeError:
                pass

        return sources, suggestions

    def generate_chat_title(self, first_message: str) -> str:
        """Generates a 2-3 word summary title for a new chat session."""
        prompt = f"Summarize the user's intent in exactly 2 to 3 words. No quotes. Nothing else.\n\nUser: {first_message}"
        try:
            if self.provider == "gemini":
                model = self.gemini_client.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content(prompt)
                title = response.text.replace('"', '').strip()
            else:
                model_name = "openai/gpt-4o-mini" if self.provider == "openrouter" else "gpt-4o-mini"
                response = self.openai_client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=10,
                    temperature=0.3,
                )
                title = response.choices[0].message.content.replace('"', '').strip()
            
            words = title.split()
            if len(words) > 4:
                title = " ".join(words[:3])
            return title
        except Exception as e:
            logger.error("generate_chat_title.error: %s", e)
            return "New Chat"

    def explore_the_web(self, query: str):
        """
        Search-Augmented Generation streaming generator for the Explore Hub.

        Yields SSE-formatted strings:
          data: {"type": "chunk", "text": "..."}\\n\\n
          data: {"type": "sources", "sources": [{title, url, snippet, favicon}]}\\n\\n
        """
        import json as _json
        from services import search_service

        sources: list[dict] = []

        # ── Step A: gather context via DuckDuckGo + trafilatura ───────────────
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

        # Yield sources metadata first so the frontend can render chips immediately
        if sources:
            for src in sources:
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(src["url"]).netloc.replace("www.", "")
                    src["favicon"] = f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
                except Exception:
                    src["favicon"] = ""
            yield f"data: {_json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # ── Step B: stream AI response ────────────────────────────────────────
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ]

            from openai import OpenAI as _OAI
            if AI_PROVIDER == "openrouter":
                client = _OAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=os.getenv("OPENROUTER_API_KEY"),
                )
                stream_model = "openai/gpt-4o"
                stream = client.chat.completions.create(
                    model=stream_model, messages=messages, stream=True, max_tokens=2048,
                )
                for chunk in stream:
                    text = getattr(chunk.choices[0].delta, "content", None) or ""
                    if text:
                        yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"

            elif AI_PROVIDER == "openai":
                client = _OAI(api_key=os.getenv("OPENAI_API_KEY"))
                stream = client.chat.completions.create(
                    model="gpt-4o", messages=messages, stream=True, max_tokens=2048,
                )
                for chunk in stream:
                    text = getattr(chunk.choices[0].delta, "content", None) or ""
                    if text:
                        yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"

            else:
                # Gemini streaming
                genai_mod = self.gemini_client
                gmodel = genai_mod.GenerativeModel(
                    model_name=self.GEMINI_CHAT_MODEL,
                    system_instruction=system_prompt,
                )
                response = gmodel.generate_content(
                    query, stream=True, generation_config={"max_output_tokens": 2048},
                )
                for chunk in response:
                    text = getattr(chunk, "text", "") or ""
                    if text:
                        yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as exc:
            logger.error("explore_the_web.stream_failed: %s", exc)
            yield f"data: {_json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    # ── Embeddings ──────────────────────────────────────────────────────
    def get_embeddings(self, text_list: List[str]) -> List[List[float]]:
        if not text_list:
            return []
        return self.embeddings.embed_documents(text_list)

    # ── File validation ─────────────────────────────────────────────────
    def validate_file(self, filepath: str) -> bool:
        try:
            if not os.path.exists(filepath):
                return False
            if os.path.getsize(filepath) > 10 * 1024 * 1024:
                return False
            allowed = (".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg")
            if not filepath.lower().endswith(allowed):
                return False
            return True
        except Exception as e:
            logger.error(f"File validation error: {e}")
            return False
