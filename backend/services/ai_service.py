import os
import logging
import base64
from typing import List, Dict, Optional
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_core.embeddings import Embeddings as LCEmbeddings
# NOTE: langchain_google_genai is NOT used for embeddings — its default v1beta endpoint
# dropped support for text-embedding-004. We use a direct REST call to the stable v1 API.

load_dotenv()

logger = logging.getLogger(__name__)

# ── Provider detection ──────────────────────────────────────────────────
# Set AI_PROVIDER=gemini or AI_PROVIDER=openai in .env (default: auto-detect)

_provider = os.getenv("AI_PROVIDER", "").lower()


# langchain_google_genai@2.x hardcodes the v1beta endpoint which dropped
# text-embedding-004. We call the stable v1 REST API directly.

class GeminiV1Embeddings(LCEmbeddings):
    """Langchain-compatible embeddings that call the Gemini REST API directly.

    Extends ``langchain_core.embeddings.Embeddings`` so that langchain_chroma
    and other Langchain integrations recognise this as a native embeddings
    provider and call ``embed_documents`` / ``embed_query`` without any
    intermediate wrapping or fallback.

    Bypasses langchain_google_genai's hardcoded endpoint configuration.
    Set ``api_version`` to ``'v1beta'`` (default) or ``'v1'`` to match what
    your API key / account supports.  Use ``ListModels`` to discover which
    embedding models are available on your key.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "models/gemini-embedding-001",
        api_version: str = "v1beta",
    ):
        import requests as _requests
        self._requests = _requests
        self.api_key = api_key
        self.api_version = api_version
        # Normalise: strip leading 'models/' — we always prefix it ourselves
        bare = model.replace("models/", "", 1)
        self.model = bare
        self._batch_url = (
            f"https://generativelanguage.googleapis.com/{api_version}/models/{bare}:batchEmbedContents"
        )
        self._embed_url = (
            f"https://generativelanguage.googleapis.com/{api_version}/models/{bare}:embedContent"
        )

    def _batch_embed(self, texts: List[str]) -> List[List[float]]:
        payload = {
            "requests": [
                {
                    "model": f"models/{self.model}",
                    "content": {"parts": [{"text": t}]},
                    "task_type": "RETRIEVAL_DOCUMENT",
                }
                for t in texts
            ]
        }
        resp = self._requests.post(
            self._batch_url,
            params={"key": self.api_key},
            json=payload,
            timeout=60,
        )
        if not resp.ok:
            raise RuntimeError(f"Error embedding content: {resp.status_code} {resp.text}")
        data = resp.json()
        # batchEmbedContents response: {"embeddings": [{"values": [...], ...}]}
        # NOT {"embeddings": [{"embedding": {"values": [...]}}]} — that's the single embedContent format
        return [item["values"] for item in data["embeddings"]]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of documents (batched to 100 per call)."""
        results = []
        for i in range(0, len(texts), 100):
            results.extend(self._batch_embed(texts[i : i + 100]))
        return results

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query string."""
        payload = {
            "model": f"models/{self.model}",
            "content": {"parts": [{"text": text}]},
            "task_type": "RETRIEVAL_QUERY",
        }
        resp = self._requests.post(
            self._embed_url,
            params={"key": self.api_key},
            json=payload,
            timeout=60,
        )
        if not resp.ok:
            raise RuntimeError(f"Error embedding query: {resp.status_code} {resp.text}")
        return resp.json()["embedding"]["values"]


if _provider == "poe":
    AI_PROVIDER = "poe"
elif _provider == "gemini":
    AI_PROVIDER = "gemini"
elif _provider == "openai":
    AI_PROVIDER = "openai"
elif os.getenv("OPENAI_API_KEY"):
    # Prefer OpenAI when available — reliable function/tool calling support.
    # Poe is still used as a fallback inside the agentic loop if Poe quota is exceeded.
    AI_PROVIDER = "openai"
elif os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
    AI_PROVIDER = "gemini"
elif os.getenv("POE_API_KEY"):
    AI_PROVIDER = "poe"
else:
    AI_PROVIDER = "openai"  # will raise a clear error at first use if no key

logger.info(f"AI provider: {AI_PROVIDER}")

# Lazy imports based on provider
genai = None
OpenAI = None

if AI_PROVIDER == "gemini":
    import google.generativeai as genai  # noqa: F811
elif AI_PROVIDER == "openai" or AI_PROVIDER == "poe":
    from openai import OpenAI  # noqa: F811



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

    # Poe models (Default)
    POE_CHAT_MODEL = os.getenv("POE_CHAT_MODEL", "grok-3")
    POE_RESPONSE_MODEL = os.getenv("POE_RESPONSE_MODEL", "grok-3")

    # OpenAI models
    OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o")
    OPENAI_RESPONSE_MODEL = os.getenv("OPENAI_RESPONSE_MODEL", "gpt-4o")
    OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # Backward-compatible aliases
    if AI_PROVIDER == "gemini":
        CHAT_MODEL = GEMINI_CHAT_MODEL
        RESPONSE_MODEL = GEMINI_RESPONSE_MODEL
    elif AI_PROVIDER == "openai":
        CHAT_MODEL = OPENAI_CHAT_MODEL
        RESPONSE_MODEL = OPENAI_RESPONSE_MODEL
    else:
        CHAT_MODEL = POE_CHAT_MODEL
        RESPONSE_MODEL = POE_RESPONSE_MODEL

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
        else:
            # Poe does not natively expose an embeddings endpoint on api.poe.com right now
            # We'll default to falling back to OpenAI or Gemini embeddings if keys are present
            openai_key = os.getenv("OPENAI_API_KEY")
            if openai_key:
                self.embeddings = OpenAIEmbeddings(
                    model=self.OPENAI_EMBEDDING_MODEL,
                    openai_api_key=openai_key,
                )
            else:
                logger.warning("No embedding provider available for Poe. Provide OPENAI_API_KEY for embeddings.")
                self.embeddings = None

    @property
    def openai_client(self):
        if self._openai_client_instance is None:
            from openai import OpenAI as _OpenAI
            
            if self.provider == "poe":
                api_key = os.getenv("POE_API_KEY")
                if not api_key:
                    raise ValueError("POE_API_KEY environment variable is required to use Poe models.")
                self._openai_client_instance = _OpenAI(
                    base_url="https://api.poe.com/v1", 
                    api_key=api_key
                )
            else:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY environment variable is required to use OpenAI models.")
                self._openai_client_instance = _OpenAI(api_key=api_key)
                
        return self._openai_client_instance

    def _get_fallback_clients(self, model_override: str | None = None) -> list:
        """Return ordered list of (openai_compatible_client, model_name) to try.

        Primary provider first; other providers appended as fallbacks if their
        API keys are present.  This lets the system automatically recover when
        a provider hits quota / rate limits.
        """
        from openai import OpenAI as _OAI

        attempts = []
        primary_model = model_override or self.CHAT_MODEL

        # ── Primary provider ──────────────────────────────────────────────────
        attempts.append((self.openai_client, primary_model))

        # ── Poe fallback (when primary is OpenAI) ─────────────────────────────
        if self.provider != "poe":
            poe_key = os.getenv("POE_API_KEY")
            if poe_key:
                attempts.append((
                    _OAI(base_url="https://api.poe.com/v1", api_key=poe_key),
                    "grok-3",
                ))

        # ── OpenAI fallback (when primary is Poe) ─────────────────────────────
        if self.provider == "poe":
            oai_key = os.getenv("OPENAI_API_KEY")
            if oai_key:
                attempts.append((_OAI(api_key=oai_key), "gpt-4o"))

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
            # Check basic mappings
            if model_override.startswith("gpt") or model_override.startswith("o"):
                # If using Poe, just pass the model straight to Poe, don't force provider swap
                if self.provider != "poe":
                    provider = "openai"
            elif model_override.startswith("gemini"):
                if self.provider != "poe":
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
        try:
            if not question.strip():
                logger.error("Empty question provided")
                return None

            context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
            system_instruction = get_system_prompt(file_type)
            if model_override:
                system_instruction += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

            model_name = model_override or self.GEMINI_CHAT_MODEL
            gemini_genai = self.gemini_client
            model = gemini_genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
            )

            contents = []

            # Chat history
            if chat_history:
                for entry in chat_history:
                    role = entry.get("role")
                    content = entry.get("content", "")
                    if role == "user":
                        contents.append({"role": "user", "parts": [content]})
                    elif role == "assistant":
                        contents.append({"role": "model", "parts": [content]})

            # User turn with context + images
            user_parts = []
            if context:
                user_parts.append(
                    f"Context from the document:\n\n{context}\n\n---\n\nQuestion: {question}"
                )
            else:
                user_parts.append(question)

            # Multi-modal: attach images directly
            if image_paths:
                for img_path in image_paths:
                    try:
                        img_data = Path(img_path).read_bytes()
                        ext = Path(img_path).suffix.lower()
                        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext, "image/png")
                        user_parts.append({
                            "inline_data": {
                                "mime_type": mime,
                                "data": base64.b64encode(img_data).decode("utf-8"),
                            }
                        })
                    except Exception as e:
                        logger.warning(f"Could not attach image {img_path}: {e}")

            contents.append({"role": "user", "parts": user_parts})
            response = model.generate_content(contents)
            answer = response.text
            logger.info(f"Gemini answered ({len(context_chunks)} chunks, model={model_name}, images={len(image_paths or [])})")
            return answer

        except Exception as e:
            logger.error(f"Gemini error: {e}")
            return None

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
        try:
            if not question.strip():
                logger.error("Empty question provided")
                return None

            context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
            system_content = get_system_prompt(file_type)
            if model_override:
                system_content += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

            messages = [{"role": "system", "content": system_content}]

            # Chat history
            if chat_history:
                for entry in chat_history:
                    if entry.get("role") in ("user", "assistant") and entry.get("content"):
                        messages.append({"role": entry["role"], "content": entry["content"]})

            # Build user message with optional vision
            user_content = []
            text_part = f"Context from the document:\n\n{context}\n\n---\n\nQuestion: {question}" if context else question

            if image_paths:
                # Use vision-capable format
                user_content.append({"type": "text", "text": text_part})
                for img_path in image_paths:
                    try:
                        img_data = Path(img_path).read_bytes()
                        ext = Path(img_path).suffix.lower()
                        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext, "image/png")
                        b64 = base64.b64encode(img_data).decode("utf-8")
                        user_content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        })
                    except Exception as e:
                        logger.warning(f"Could not attach image {img_path}: {e}")
                messages.append({"role": "user", "content": user_content})
            else:
                messages.append({"role": "user", "content": text_part})

            # Try each available provider in order (Poe → OpenAI or OpenAI → Poe fallback)
            for _fb_client, _fb_model in self._get_fallback_clients(model_override):
                _call_model = model_override or _fb_model
                try:
                    response = _fb_client.chat.completions.create(
                        model=_call_model,
                        messages=messages,
                    )
                    answer = response.choices[0].message.content
                    logger.info("OpenAI answered (%d chunks, model=%s)", len(context_chunks), _call_model)
                    return answer
                except Exception as fb_e:
                    logger.warning("answer_from_context provider failed model=%s: %s — trying next", _call_model, fb_e)
            return None

        except Exception as e:
            logger.error("OpenAI error (outer): %s", e, exc_info=True)
            return None

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
    ) -> Dict:
        """Agentic loop: send message, handle tool calls, return final answer + artifacts."""
        # Models known to not support function/tool calling — fall back to non-agentic flow.
        _NO_TOOLS_MODELS = {"DeepSeek-R1", "DeepSeek-V3", "o1", "o1-mini", "deepseek-r1", "deepseek-v3"}
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
            if model_override.startswith("gpt") or model_override.startswith("o"):
                if self.provider != "poe":
                    provider = "openai"
            elif model_override.startswith("gemini"):
                if self.provider != "poe":
                    provider = "gemini"
            # poe models (grok-*) stay on poe provider — no change needed

        if provider == "gemini":
            return self._agentic_gemini(
                question, chat_history, tool_executor, session_id, user_id,
                file_type, model_override, memory_context, preference_context,
            )
        else:
            return self._agentic_openai(
                question, chat_history, tool_executor, session_id, user_id,
                file_type, model_override, memory_context, preference_context,
            )

    def _agentic_openai(
        self, question, chat_history, tool_executor, session_id, user_id,
        file_type, model_override, memory_context, preference_context,
    ) -> Dict:
        from services.tools import TOOL_DEFINITIONS
        import json

        system_content = get_system_prompt(file_type)
        if memory_context:
            system_content += f"\n\nBased on past sessions: {memory_context}"
        if preference_context:
            system_content += f"\n\nUser preferences: {preference_context}"
        system_content += (
            "\n\nYou have tools available. CRITICAL RULES:\n"
            "- ALWAYS call generate_flashcards (never answer in text) when the user asks for flashcards, flash cards, study cards, or spaced repetition cards.\n"
            "- ALWAYS call generate_quiz (never answer in text) when the user asks for a quiz, test, or multiple-choice questions.\n"
            "- ALWAYS call create_study_guide when the user asks for a study guide or outline.\n"
            "- ALWAYS call generate_visualization when the user asks for a diagram, chart, or mind map.\n"
            "- Use search_documents to find information from uploaded documents before answering factual questions.\n"
            "- DO NOT produce flashcards or quiz questions as plain text. You MUST use the corresponding tool."
        )
        if model_override:
            system_content += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

        messages = [{"role": "system", "content": system_content}]
        for entry in (chat_history or []):
            if entry.get("role") in ("user", "assistant") and entry.get("content"):
                messages.append({"role": entry["role"], "content": entry["content"]})
        messages.append({"role": "user", "content": question})

        # Use CHAT_MODEL (provider-aware) not OPENAI_CHAT_MODEL (hardcoded "gpt-4o")
        model = model_override or self.CHAT_MODEL
        fallback_clients = self._get_fallback_clients(model_override)
        artifacts = []
        tool_calls_log = []
        max_rounds = 3

        # Map keyword → exact tool name to force on the first round.
        # Using {"type": "function", "function": {"name": "..."}} forces the model
        # to call THAT specific tool — it cannot satisfy the requirement by calling
        # a different one (e.g. search_documents) and then answering in text.
        _q_lower = question.lower()
        _forced_tool: str | None = None
        if any(kw in _q_lower for kw in ("flashcard", "flash card", "study card", "spaced repetition")):
            _forced_tool = "generate_flashcards"
        elif any(kw in _q_lower for kw in ("quiz", "test me", "multiple choice", "test my knowledge")):
            _forced_tool = "generate_quiz"
        elif any(kw in _q_lower for kw in ("study guide", "outline", "summarize")):
            _forced_tool = "create_study_guide"
        elif any(kw in _q_lower for kw in ("diagram", "mind map", "visualization", "chart")):
            _forced_tool = "generate_visualization"

        for _round in range(max_rounds):
            # Round 0: force the specific tool if one was detected.
            # Later rounds: fall back to auto so the model can process tool results.
            if _round == 0 and _forced_tool:
                _tool_choice = {"type": "function", "function": {"name": _forced_tool}}
            else:
                _tool_choice = "auto"

            # Try each available provider; fall back when one hits quota / errors.
            response = None
            last_err = None
            for _fb_client, _fb_model in fallback_clients:
                _call_model = model_override or _fb_model
                for _tc in ([_tool_choice, "auto"] if _tool_choice != "auto" else ["auto"]):
                    try:
                        response = _fb_client.chat.completions.create(
                            model=_call_model,
                            messages=messages,
                            tools=TOOL_DEFINITIONS,
                            tool_choice=_tc,
                        )
                        last_err = None
                        break  # success
                    except Exception as e:
                        last_err = e
                        logger.warning(
                            "agentic call failed provider=%s model=%s tool_choice=%s: %s — trying next",
                            _fb_client.base_url if hasattr(_fb_client, "base_url") else "?",
                            _call_model, _tc, e,
                        )
                if response is not None:
                    break  # found a working provider

            if response is None:
                logger.error("All providers failed for agentic call: %s", last_err, exc_info=True)
                return {"answer": "I encountered an error processing your request.", "sources": [], "artifacts": [], "suggestions": []}


            choice = response.choices[0]

            if choice.finish_reason == "tool_calls" or (choice.message.tool_calls and len(choice.message.tool_calls) > 0):
                messages.append(choice.message)

                for tc in choice.message.tool_calls:
                    fn_name = tc.function.name
                    try:
                        fn_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        fn_args = {}

                    if model_override:
                        fn_args["model"] = model_override

                    result = tool_executor.execute(fn_name, fn_args, session_id, user_id)
                    tool_calls_log.append({"tool": fn_name, "args": fn_args, "result_keys": list(result.keys())})

                    if result.get("artifact_type"):
                        artifacts.append(result)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result),
                    })
            else:
                answer = choice.message.content or ""
                sources, suggestions = self._parse_response_extras(answer, tool_calls_log)
                return {
                    "answer": answer,
                    "sources": sources,
                    "artifacts": artifacts,
                    "suggestions": suggestions,
                    "tool_calls": tool_calls_log,
                }

        # Max rounds reached — get final response
        try:
            response = self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
            )
            answer = response.choices[0].message.content or ""
        except Exception:
            answer = "I reached the maximum processing steps. Here's what I found so far."

        sources, suggestions = self._parse_response_extras(answer, tool_calls_log)
        return {
            "answer": answer,
            "sources": sources,
            "artifacts": artifacts,
            "suggestions": suggestions,
            "tool_calls": tool_calls_log,
        }

    def _agentic_gemini(
        self, question, chat_history, tool_executor, session_id, user_id,
        file_type, model_override, memory_context, preference_context,
    ) -> Dict:
        from services.tools import GEMINI_TOOL_DEFINITIONS
        import json

        system_instruction = get_system_prompt(file_type)
        if memory_context:
            system_instruction += f"\n\nBased on past sessions: {memory_context}"
        if preference_context:
            system_instruction += f"\n\nUser preferences: {preference_context}"
        system_instruction += (
            "\n\nYou have tools available. Use search_documents to find information from uploaded documents. "
            "Use generate_quiz when the user asks for a quiz or multiple-choice questions. "
            "Use generate_flashcards when the user asks for flashcards, flash cards, or spaced repetition study cards. "
            "Use create_study_guide when the user asks for a study guide or outline. "
            "Use generate_visualization when the user asks for a diagram or visualization. "
            "If you cannot find information, state what's missing and suggest 2-3 alternative questions "
            "in this format: ```suggestions\n[{\"text\": \"...\", \"reason\": \"...\"}]\n```"
        )
        if model_override:
            system_instruction += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

        model_name = model_override or self.GEMINI_CHAT_MODEL
        gemini_genai = self.gemini_client
        model = gemini_genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            tools=[{"function_declarations": GEMINI_TOOL_DEFINITIONS}],
        )

        contents = []
        for entry in (chat_history or []):
            role = entry.get("role")
            content = entry.get("content", "")
            if role == "user":
                contents.append({"role": "user", "parts": [content]})
            elif role == "assistant":
                contents.append({"role": "model", "parts": [content]})
        contents.append({"role": "user", "parts": [question]})

        artifacts = []
        tool_calls_log = []
        max_rounds = 3

        for _round in range(max_rounds):
            try:
                response = model.generate_content(contents)
            except Exception as e:
                logger.error("Gemini agentic call failed: %s", e, exc_info=True)
                return {"answer": "I encountered an error processing your request.", "sources": [], "artifacts": [], "suggestions": []}

            # Check for function calls
            candidate = response.candidates[0] if response.candidates else None
            if not candidate:
                return {"answer": "No response generated.", "sources": [], "artifacts": [], "suggestions": []}

            has_function_call = False
            function_responses = []

            for part in candidate.content.parts:
                if hasattr(part, 'function_call') and part.function_call:
                    has_function_call = True
                    fn_name = part.function_call.name
                    fn_args = dict(part.function_call.args) if part.function_call.args else {}
                    
                    if model_override:
                        fn_args["model"] = model_override

                    result = tool_executor.execute(fn_name, fn_args, session_id, user_id)
                    tool_calls_log.append({"tool": fn_name, "args": fn_args, "result_keys": list(result.keys())})

                    if result.get("artifact_type"):
                        artifacts.append(result)

                    function_responses.append({
                        "function_response": {
                            "name": fn_name,
                            "response": result,
                        }
                    })

            if has_function_call:
                contents.append(candidate.content)
                contents.append({"role": "user", "parts": function_responses})
            else:
                answer = response.text or ""
                sources, suggestions = self._parse_response_extras(answer, tool_calls_log)
                return {
                    "answer": answer,
                    "sources": sources,
                    "artifacts": artifacts,
                    "suggestions": suggestions,
                    "tool_calls": tool_calls_log,
                }

        # Max rounds — get final text
        try:
            response = model.generate_content(contents)
            answer = response.text or ""
        except Exception:
            answer = "I reached the maximum processing steps."

        sources, suggestions = self._parse_response_extras(answer, tool_calls_log)
        return {
            "answer": answer,
            "sources": sources,
            "artifacts": artifacts,
            "suggestions": suggestions,
            "tool_calls": tool_calls_log,
        }

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
                model_name = "grok-3-mini" if self.provider == "poe" else "gpt-4o-mini"
                response = self.openai_client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=10,
                    temperature=0.3
                )
                title = response.choices[0].message.content.replace('"', '').strip()
            
            words = title.split()
            if len(words) > 4:
                title = " ".join(words[:3])
            return title
        except Exception as e:
            logger.error("generate_chat_title.error: %s", e)
            return "New Chat"

    def explore_the_web(self, query: str, use_poe_search: bool = False, poe_api_key: str = None):
        """
        Search-Augmented Generation streaming generator for the Explore Hub.

        Yields SSE-formatted strings:
          data: {"type": "chunk", "text": "..."}\\n\\n
          data: {"type": "sources", "sources": [{title, url, snippet, favicon}]}\\n\\n

        If *use_poe_search* is True, delegates to Poe's native Web-Search bot
        instead of running the DuckDuckGo + trafilatura pipeline.
        """
        import json as _json
        from services import search_service

        sources: list[dict] = []

        # ── Step A: gather context ─────────────────────────────────────────────
        if use_poe_search:
            # Route through Poe's built-in web-search capability
            context_block = ""
            system_prompt = (
                "You are FileGeek Explore — an AI research assistant with live web search access. "
                "Answer the user's query thoroughly. Use inline citations like [1], [2] where applicable."
            )
            bot_model = "Web-Search"  # Poe native
        else:
            # DuckDuckGo → trafilatura pipeline
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
            bot_model = "GPT-4o"

        # Yield sources metadata first so the frontend can render source chips immediately
        if sources:
            for src in sources:
                domain = ""
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(src["url"]).netloc.replace("www.", "")
                    src["favicon"] = f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
                except Exception:
                    src["favicon"] = ""
            yield f"data: {_json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # ── Step B: stream Poe / OpenAI response ─────────────────────────────
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ]

            if AI_PROVIDER == "poe":
                client = OpenAI(
                    api_key=poe_api_key or os.getenv("POE_API_KEY"),
                    base_url="https://api.poe.com/v1",
                )
                stream = client.chat.completions.create(
                    model=bot_model,
                    messages=messages,
                    stream=True,
                    max_tokens=2048,
                )
            elif AI_PROVIDER == "openai":
                client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                stream = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    stream=True,
                    max_tokens=2048,
                )
            else:
                # Gemini streaming synthesis
                genai_mod = self.gemini_client
                gmodel = genai_mod.GenerativeModel(
                    model_name=GEMINI_CHAT_MODEL,
                    system_instruction=system_prompt,
                )
                response = gmodel.generate_content(
                    query,
                    stream=True,
                    generation_config={"max_output_tokens": 2048},
                )
                for chunk in response:
                    text = getattr(chunk, "text", "") or ""
                    if text:
                        yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"

            # Poe's Web-Search bot prepends "Searching… (Xs elapsed)" status lines
            # before the real answer. Buffer until we detect real content.
            import re as _re
            _STATUS_RE = _re.compile(
                r'^(?:(?:Searching\.{3}|Searching…)(?:\s*\(\d+s elapsed\))?\s*)*',
                _re.MULTILINE,
            )
            seen_content = False
            pre_buf = ""

            for chunk in stream:
                delta = chunk.choices[0].delta
                text = getattr(delta, "content", None) or ""
                if not text:
                    continue
                if seen_content:
                    yield f"data: {_json.dumps({'type': 'chunk', 'text': text})}\n\n"
                else:
                    pre_buf += text
                    stripped = _STATUS_RE.sub("", pre_buf).lstrip()
                    if stripped:
                        seen_content = True
                        pre_buf = ""
                        yield f"data: {_json.dumps({'type': 'chunk', 'text': stripped})}\n\n"

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
