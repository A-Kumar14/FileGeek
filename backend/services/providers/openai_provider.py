"""
services/providers/openai_provider.py — OpenAI/OpenRouter answer and agentic logic.
Receives the AIService instance as `svc` so no circular import is needed.
"""

import base64
import logging
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


def answer_openai(svc, context_chunks, question, chat_history, model_override, file_type, image_paths):
    """Generate a non-streaming answer via OpenAI-compatible API."""
    from services.ai_service import get_system_prompt
    try:
        if not question.strip():
            return None

        context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
        system_content = get_system_prompt(file_type)
        if model_override:
            system_content += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

        messages = [{"role": "system", "content": system_content}]
        if chat_history:
            for entry in chat_history:
                if entry.get("role") in ("user", "assistant") and entry.get("content"):
                    messages.append({"role": entry["role"], "content": entry["content"]})

        user_content = []
        text_part = (
            f"Context from the document:\n\n{context}\n\n---\n\nQuestion: {question}"
            if context else question
        )

        if image_paths:
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
                    logger.warning("Could not attach image %s: %s", img_path, e)
            messages.append({"role": "user", "content": user_content})
        else:
            messages.append({"role": "user", "content": text_part})

        for _fb_client, _fb_model in svc._get_fallback_clients(model_override):
            _call_model = model_override or _fb_model
            try:
                response = _fb_client.chat.completions.create(
                    model=_call_model, messages=messages
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


def agentic_openai(svc, question, chat_history, tool_executor, session_id, user_id,
                   file_type, model_override, memory_context, preference_context,
                   has_documents=False) -> Dict:
    """Agentic tool-calling loop via OpenAI function calling (also used for OpenRouter)."""
    from services.tools import TOOL_DEFINITIONS
    from services.ai_service import get_system_prompt
    import json

    system_content = get_system_prompt(file_type)
    if memory_context:
        system_content += f"\n\nBased on past sessions: {memory_context}"
    if preference_context:
        system_content += f"\n\nUser preferences: {preference_context}"
    if has_documents:
        system_content += (
            "\n\nDOCUMENTS ARE UPLOADED in this session. Rules:\n"
            "- ALWAYS call search_documents first before answering any question.\n"
            "- Base your answer STRICTLY on the retrieved document content.\n"
            "- If information is not found in the documents, say exactly: 'I cannot find that information in your document.' Do NOT guess or use general knowledge.\n"
            "- ALWAYS call generate_flashcards when asked for flashcards.\n"
            "- ALWAYS call generate_quiz when asked for a quiz.\n"
            "- ALWAYS call create_study_guide when asked for a study guide.\n"
            "- ALWAYS call generate_visualization when asked for a diagram or chart."
        )
    else:
        system_content += (
            "\n\nNo documents in this session. Rules:\n"
            "- Answer general questions directly from your own knowledge.\n"
            "- ALWAYS call generate_flashcards when asked for flashcards.\n"
            "- ALWAYS call generate_quiz when asked for a quiz.\n"
            "- ALWAYS call create_study_guide when asked for a study guide.\n"
            "- ALWAYS call generate_visualization when asked for a diagram or chart.\n"
            "- DO NOT produce flashcards or quiz questions as plain text."
        )
    if model_override:
        system_content += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

    messages = [{"role": "system", "content": system_content}]
    for entry in (chat_history or []):
        if entry.get("role") in ("user", "assistant") and entry.get("content"):
            messages.append({"role": entry["role"], "content": entry["content"]})
    messages.append({"role": "user", "content": question})

    resolved_override = svc._resolve_model(model_override)
    model = resolved_override or svc.CHAT_MODEL
    fallback_clients = svc._get_fallback_clients(model_override)
    artifacts = []
    tool_calls_log = []
    max_rounds = 3

    _q_lower = question.lower()
    _forced_tool: str | None = None
    if any(kw in _q_lower for kw in ("flashcard", "flash card", "study card", "spaced repetition")):
        _forced_tool = "generate_flashcards"
    elif any(kw in _q_lower for kw in ("quiz", "test me", "multiple choice", "test my knowledge")):
        _forced_tool = "generate_quiz"
    elif any(kw in _q_lower for kw in ("study guide", "outline")):
        _forced_tool = "create_study_guide"
    elif any(kw in _q_lower for kw in ("diagram", "mind map", "visualization", "chart")):
        _forced_tool = "generate_visualization"
    elif has_documents:
        _forced_tool = "search_documents"

    for _round in range(max_rounds):
        if _round == 0 and _forced_tool:
            _tool_choice = {"type": "function", "function": {"name": _forced_tool}}
        else:
            _tool_choice = "auto"

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
                    break
                except Exception as e:
                    last_err = e
                    logger.warning(
                        "agentic call failed model=%s tool_choice=%s: %s — trying next",
                        _call_model, _tc, e,
                    )
            if response is not None:
                break

        if response is None:
            # Tool-calling rejected by all providers — fall back to a plain completion.
            # This handles models that don't support function calling or return API errors.
            logger.warning(
                "tool-calling failed round=%d err=%s — retrying without tools", _round, last_err
            )
            for _fb_client, _fb_model in fallback_clients:
                _call_model = model_override or _fb_model
                try:
                    response = _fb_client.chat.completions.create(
                        model=_call_model, messages=messages
                    )
                    break
                except Exception as plain_err:
                    logger.warning("no-tools fallback failed model=%s: %s", _call_model, plain_err)

            if response is None:
                logger.error("All providers failed (with and without tools): %s", last_err)
                return {"answer": "I encountered an error processing your request.",
                        "sources": [], "artifacts": [], "suggestions": []}

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
            sources, suggestions = svc._parse_response_extras(answer, tool_calls_log)
            return {
                "answer": answer, "sources": sources, "artifacts": artifacts,
                "suggestions": suggestions, "tool_calls": tool_calls_log,
            }

    # Max rounds reached — get final response
    try:
        response = svc.openai_client.chat.completions.create(
            model=model, messages=messages
        )
        answer = response.choices[0].message.content or ""
    except Exception:
        answer = "I reached the maximum processing steps. Here's what I found so far."

    sources, suggestions = svc._parse_response_extras(answer, tool_calls_log)
    return {
        "answer": answer, "sources": sources, "artifacts": artifacts,
        "suggestions": suggestions, "tool_calls": tool_calls_log,
    }
