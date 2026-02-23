"""
services/providers/gemini_provider.py — Gemini-specific embeddings, answer, and agentic logic.
Receives the AIService instance as `svc` so no circular import is needed.
"""

import base64
import logging
from pathlib import Path
from typing import Dict, List, Optional

from langchain_core.embeddings import Embeddings as LCEmbeddings

logger = logging.getLogger(__name__)


class GeminiV1Embeddings(LCEmbeddings):
    """Langchain-compatible embeddings via the Gemini REST API (stable v1 endpoint).

    Bypasses langchain_google_genai's hardcoded v1beta configuration.
    Set ``api_version`` to ``'v1beta'`` (default) or ``'v1'``.
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
        return [item["values"] for item in data["embeddings"]]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        results = []
        for i in range(0, len(texts), 100):
            results.extend(self._batch_embed(texts[i: i + 100]))
        return results

    def embed_query(self, text: str) -> List[float]:
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


def answer_gemini(svc, context_chunks, question, chat_history, model_override, file_type, image_paths):
    """Generate a non-streaming answer via Gemini."""
    from services.ai_service import get_system_prompt
    try:
        if not question.strip():
            return None

        context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
        system_instruction = get_system_prompt(file_type)
        if model_override:
            system_instruction += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

        model_name = model_override or svc.GEMINI_CHAT_MODEL
        model = svc.gemini_client.GenerativeModel(
            model_name=model_name, system_instruction=system_instruction
        )

        contents = []
        if chat_history:
            for entry in chat_history:
                role = entry.get("role")
                content = entry.get("content", "")
                if role == "user":
                    contents.append({"role": "user", "parts": [content]})
                elif role == "assistant":
                    contents.append({"role": "model", "parts": [content]})

        user_parts = []
        if context:
            user_parts.append(f"Context from the document:\n\n{context}\n\n---\n\nQuestion: {question}")
        else:
            user_parts.append(question)

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
                    logger.warning("Could not attach image %s: %s", img_path, e)

        contents.append({"role": "user", "parts": user_parts})
        response = model.generate_content(contents)
        answer = response.text
        logger.info("Gemini answered (%d chunks, model=%s, images=%d)",
                    len(context_chunks), model_name, len(image_paths or []))
        return answer
    except Exception as e:
        logger.error("Gemini error: %s", e)
        return None


def agentic_gemini(svc, question, chat_history, tool_executor, session_id, user_id,
                   file_type, model_override, memory_context, preference_context,
                   has_documents=False) -> Dict:
    """Agentic tool-calling loop via Gemini function calling."""
    from services.tools import GEMINI_TOOL_DEFINITIONS
    from services.ai_service import get_system_prompt
    import json

    system_instruction = get_system_prompt(file_type)
    if memory_context:
        system_instruction += f"\n\nBased on past sessions: {memory_context}"
    if preference_context:
        system_instruction += f"\n\nUser preferences: {preference_context}"
    if has_documents:
        system_instruction += (
            "\n\nDOCUMENTS ARE UPLOADED in this session. "
            "ALWAYS call search_documents first before answering any question. "
            "Base your answer STRICTLY on the retrieved document content. "
            "If information is not found, say: 'I cannot find that information in your document.' "
            "Use generate_quiz, generate_flashcards, create_study_guide, generate_visualization when asked."
        )
    else:
        system_instruction += (
            "\n\nNo documents in this session. Answer general questions from your own knowledge. "
            "Use generate_quiz when asked for a quiz. Use generate_flashcards when asked for flashcards. "
            "Use create_study_guide when asked for a study guide. "
            "Use generate_visualization when asked for a diagram or visualization."
        )
    if model_override:
        system_instruction += "\n\nThink step by step. Be thorough, exhaustive, and analytical."

    model_name = model_override or svc.GEMINI_CHAT_MODEL
    model = svc.gemini_client.GenerativeModel(
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
            return {"answer": "I encountered an error processing your request.",
                    "sources": [], "artifacts": [], "suggestions": []}

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
                    "function_response": {"name": fn_name, "response": result}
                })

        if has_function_call:
            contents.append(candidate.content)
            contents.append({"role": "user", "parts": function_responses})
        else:
            answer = response.text or ""
            sources, suggestions = svc._parse_response_extras(answer, tool_calls_log)
            return {
                "answer": answer, "sources": sources, "artifacts": artifacts,
                "suggestions": suggestions, "tool_calls": tool_calls_log,
            }

    # Max rounds — get final text
    try:
        response = model.generate_content(contents)
        answer = response.text or ""
    except Exception:
        answer = "I reached the maximum processing steps."

    sources, suggestions = svc._parse_response_extras(answer, tool_calls_log)
    return {
        "answer": answer, "sources": sources, "artifacts": artifacts,
        "suggestions": suggestions, "tool_calls": tool_calls_log,
    }
