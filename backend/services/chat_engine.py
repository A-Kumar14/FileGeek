"""
services/chat_engine.py — Async agentic RAG loop.

Replaces the threading.Thread + queue.Queue hack in chat.py.
All LLM calls are async (AsyncOpenAI); tool executor runs in a thread pool.
"""

import asyncio
import json
import logging
import re
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are FileGeek — a brilliant analytical AI assistant who helps users deeply "
    "understand their documents.\n"
    "- Structured and clear: always use Markdown (headers, lists, bold, code blocks)\n"
    "- Adaptive depth: concise for quick lookups; thorough with examples for concepts\n"
    "- Math formatting: Always wrap mathematical variables, expressions, and formulas in "
    "$...$ for inline math and $$...$$ for block math. Do not use plain parentheses for math.\n"
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


class ChatEngine:
    """Stateless agentic loop.  Instantiate once as a module-level singleton."""

    MAX_ROUNDS = 3

    def __init__(self, llm_service, vector_store, embedding_service, tool_executor):
        self._llm = llm_service
        self._vs = vector_store
        self._emb = embedding_service
        self._tools = tool_executor

    # ── Main entry point ─────────────────────────────────────────────────────

    async def generate_response(
        self,
        question: str,
        session_id: str,
        user_id: int,
        chat_history: List[Dict],
        db,              # AsyncSession
        model: Optional[str] = None,
        deep_think: bool = False,
        has_documents: bool = False,
        memory_context: str = "",
        preference_context: str = "",
        file_type: str = "pdf",
        on_progress: Optional[Callable] = None,
    ) -> Dict:
        """
        Run the agentic loop and return a result dict:
        {answer, sources, artifacts, suggestions, tool_calls}
        """
        from services.tools import TOOL_DEFINITIONS

        # Build system prompt
        system = DEFAULT_SYSTEM_PROMPT + FILE_TYPE_MODIFIERS.get(file_type, "")
        if memory_context:
            system += f"\n\nBased on past sessions: {memory_context}"
        if preference_context:
            system += f"\n\nUser preferences: {preference_context}"
        if has_documents:
            system += (
                "\n\nDOCUMENTS ARE UPLOADED in this session. Rules:\n"
                "- ALWAYS call search_documents first before answering any question.\n"
                "- Base your answer STRICTLY on the retrieved document content.\n"
                "- If information is not found in the documents, say exactly: "
                "'I cannot find that information in your document.' Do NOT guess.\n"
                "- ALWAYS call generate_flashcards when asked for flashcards.\n"
                "- ALWAYS call generate_quiz when asked for a quiz.\n"
                "- ALWAYS call create_study_guide when asked for a study guide.\n"
                "- ALWAYS call generate_visualization when asked for a diagram or chart."
            )
        else:
            system += (
                "\n\nNo documents in this session. Rules:\n"
                "- Answer general questions directly from your own knowledge.\n"
                "- ALWAYS call generate_flashcards when asked for flashcards.\n"
                "- ALWAYS call generate_quiz when asked for a quiz.\n"
                "- ALWAYS call create_study_guide when asked for a study guide.\n"
                "- ALWAYS call generate_visualization when asked for a diagram or chart.\n"
                "- DO NOT produce flashcards or quiz questions as plain text."
            )
        if deep_think:
            system += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

        # Build message history
        messages = [{"role": "system", "content": system}]
        for entry in (chat_history or []):
            if entry.get("role") in ("user", "assistant") and entry.get("content"):
                messages.append({"role": entry["role"], "content": entry["content"]})
        messages.append({"role": "user", "content": question})

        # Determine forced first tool
        q_lower = question.lower()
        forced_tool: Optional[str] = None
        if any(kw in q_lower for kw in ("flashcard", "flash card", "study card")):
            forced_tool = "generate_flashcards"
        elif any(kw in q_lower for kw in ("quiz", "test me", "multiple choice")):
            forced_tool = "generate_quiz"
        elif any(kw in q_lower for kw in ("study guide", "outline")):
            forced_tool = "create_study_guide"
        elif any(kw in q_lower for kw in ("diagram", "mind map", "visualization", "chart")):
            forced_tool = "generate_visualization"
        elif has_documents:
            forced_tool = "search_documents"

        def emit(event: dict):
            if on_progress:
                try:
                    on_progress(event)
                except Exception:
                    pass

        # Resolve model
        resolved_model = self._llm.resolve_model(model)

        artifacts = []
        tool_calls_log = []
        loop = asyncio.get_running_loop()

        for round_num in range(self.MAX_ROUNDS):
            # Determine tool_choice
            if round_num == 0 and forced_tool:
                tool_choice = {"type": "function", "function": {"name": forced_tool}}
            else:
                tool_choice = "auto"

            emit({"type": "status", "text": "Thinking…"})

            try:
                response = await self._llm.chat(
                    messages=messages,
                    model=resolved_model,
                    tools=TOOL_DEFINITIONS,
                    tool_choice=tool_choice,
                )
            except Exception as exc:
                logger.error(
                    "ChatEngine.chat failed round=%d model=%s: %s",
                    round_num, resolved_model, exc,
                )
                return {
                    "answer": "I encountered an error processing your request.",
                    "sources": [], "artifacts": [], "suggestions": [],
                }

            choice = response.choices[0]
            tool_calls = getattr(choice.message, "tool_calls", None)

            if choice.finish_reason == "tool_calls" or (tool_calls and len(tool_calls) > 0):
                # Serialize to plain dict so the next round's API call receives valid JSON.
                # Passing the raw ChatCompletionMessage object can cause serialization
                # issues in some openai SDK versions when used as a message in a later call.
                # Manually build a minimal dict with only the fields the API expects.
                # model_dump() includes SDK-internal fields (refusal, function_call)
                # that some OpenRouter providers reject or mishandle.
                assistant_dict = {"role": "assistant"}
                if choice.message.content is not None:
                    assistant_dict["content"] = choice.message.content
                if tool_calls:
                    assistant_dict["tool_calls"] = [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ]
                messages.append(assistant_dict)

                for tc in tool_calls:
                    fn_name = tc.function.name
                    try:
                        fn_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        fn_args = {}

                    if model:
                        fn_args["model"] = model

                    emit({"type": "tool_start", "tool": fn_name})

                    # Run sync tool executor in thread pool
                    result = await loop.run_in_executor(
                        None, self._tools.execute, fn_name, fn_args, session_id, user_id
                    )
                    emit({"type": "tool_done", "tool": fn_name})
                    tool_calls_log.append({
                        "tool": fn_name,
                        "args": fn_args,
                        "result_keys": list(result.keys()),
                    })

                    if result.get("artifact_type"):
                        artifacts.append(result)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result),
                    })
            else:
                # Final answer
                emit({"type": "status", "text": "Generating response…"})
                answer = (choice.message.content or "")
                sources, suggestions = _parse_extras(answer, tool_calls_log)
                return {
                    "answer": answer,
                    "sources": sources,
                    "artifacts": artifacts,
                    "suggestions": suggestions,
                    "tool_calls": tool_calls_log,
                }

        # Max rounds reached — force a final answer
        emit({"type": "status", "text": "Finalising…"})
        try:
            response = await self._llm.chat(messages=messages, model=resolved_model)
            answer = response.choices[0].message.content or ""
        except Exception:
            answer = "I reached the maximum processing steps."

        sources, suggestions = _parse_extras(answer, tool_calls_log)
        return {
            "answer": answer,
            "sources": sources,
            "artifacts": artifacts,
            "suggestions": suggestions,
            "tool_calls": tool_calls_log,
        }

    # ── Title generation ─────────────────────────────────────────────────────

    async def generate_chat_title(self, first_message: str) -> str:
        prompt = (
            "Summarize the user's intent in exactly 2 to 3 words. "
            f"No quotes. Nothing else.\n\nUser: {first_message}"
        )
        try:
            title_model = None
            if self._llm._provider == "openrouter":
                title_model = "openai/gpt-4o-mini"
            elif self._llm._provider == "openai":
                title_model = "gpt-4o-mini"
            # else: default model

            text = await self._llm.simple_response(prompt, model=title_model)
            words = text.replace('"', '').strip().split()
            if len(words) > 4:
                words = words[:3]
            return " ".join(words) if words else "New Chat"
        except Exception as e:
            logger.warning("ChatEngine.generate_chat_title failed: %s", e)
            return "New Chat"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_extras(answer: str, tool_calls_log: list):
    """Extract sources from tool log and parse suggestion blocks."""
    sources = []

    # Build sources list from search_documents tool results
    for tc in tool_calls_log:
        if tc["tool"] == "search_documents" and "results" in tc.get("result_keys", []):
            pass  # Sources are built by rag_service and embedded in the answer

    suggestions = []
    m = re.search(r'```suggestions\s*\n(.*?)\n```', answer, re.DOTALL)
    if m:
        try:
            suggestions = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    return sources, suggestions
