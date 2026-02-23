import json
import logging
import re
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Tool definitions in OpenAI function-calling format
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "Search the user's uploaded documents for information relevant to a query. Use this to find specific facts, passages, or data from the documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant document passages",
                    },
                    "n_results": {
                        "type": "integer",
                        "description": "Number of results to return (default 5, max 12)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_quiz",
            "description": "Generate a quiz with multiple-choice questions based on document content. Returns a structured quiz artifact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "The topic or section to generate quiz questions about",
                    },
                    "num_questions": {
                        "type": "integer",
                        "description": "Number of questions to generate (default 5)",
                        "default": 5,
                    },
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_study_guide",
            "description": "Create a structured study guide from the document content. Returns a study guide artifact with sections, key points, and review questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "The topic or focus area for the study guide",
                    },
                    "depth": {
                        "type": "string",
                        "enum": ["brief", "standard", "comprehensive"],
                        "description": "Level of detail (default: standard)",
                        "default": "standard",
                    },
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_visualization",
            "description": "Generate a visual representation of concepts. Supports Mermaid diagrams, tables, and structured data. Returns a visualization artifact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "What to visualize (e.g., 'flowchart of the process', 'comparison table of methods')",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["mermaid", "table", "code"],
                        "description": "Visualization type",
                        "default": "mermaid",
                    },
                },
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_flashcards",
            "description": "Generate flashcards for spaced repetition study. Creates question-answer pairs based on document content. Returns a flashcard artifact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "The topic or section to create flashcards about",
                    },
                    "num_cards": {
                        "type": "integer",
                        "description": "Number of flashcards to generate (default 10, max 20)",
                        "default": 10,
                    },
                    "card_type": {
                        "type": "string",
                        "enum": ["definition", "concept", "fact", "mixed"],
                        "description": "Type of flashcards to generate (default: mixed)",
                        "default": "mixed",
                    },
                },
                "required": ["topic"],
            },
        },
    },
]

# Gemini-compatible tool format
GEMINI_TOOL_DEFINITIONS = []
for tool in TOOL_DEFINITIONS:
    fn = tool["function"]
    GEMINI_TOOL_DEFINITIONS.append({
        "name": fn["name"],
        "description": fn["description"],
        "parameters": fn["parameters"],
    })


class ToolExecutor:
    """Executes tool calls from the AI model."""

    def __init__(self, rag_service, ai_service):
        self.rag_service = rag_service
        self.ai_service = ai_service

    def execute(self, tool_name: str, arguments: dict, session_id: str, user_id: int) -> dict:
        handler = {
            "search_documents": self._search_documents,
            "generate_quiz": self._generate_quiz,
            "create_study_guide": self._create_study_guide,
            "generate_visualization": self._generate_visualization,
            "generate_flashcards": self._generate_flashcards,
        }.get(tool_name)

        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            return handler(arguments, session_id, user_id)
        except Exception as e:
            logger.error(f"Tool {tool_name} execution error: {e}")
            return {"error": str(e)}

    def _search_documents(self, args: dict, session_id: str, user_id: int) -> dict:
        query = args.get("query", "")
        n_results = min(args.get("n_results", 5), 12)

        result = self.rag_service.query(query, session_id, user_id, n_results=n_results)
        chunks = result.get("chunks", [])
        metas = result.get("metas", [])

        if not chunks:
            return {"results": [], "message": "No relevant passages found in the uploaded documents."}

        formatted = []
        for i, (chunk, meta) in enumerate(zip(chunks, metas)):
            pages = json.loads(meta.get("pages", "[]")) if meta else []
            formatted.append({
                "index": i + 1,
                "text": chunk,
                "pages": pages,
            })

        return {"results": formatted, "total": len(formatted)}

    def _generate_quiz(self, args: dict, session_id: str, user_id: int) -> dict:
        topic = args.get("topic", "general knowledge")
        num_questions = min(args.get("num_questions", 5), 10)
        model_override = args.get("model")

        # Search for relevant content; fall back to general knowledge if none found
        result = self.rag_service.query(topic, session_id, user_id, n_results=6)
        chunks = result.get("chunks", [])
        logger.info(f"generate_quiz: session={session_id} chunks_retrieved={len(chunks)} topic={topic!r}")
        context = "\n\n".join(chunks)

        if context:
            source_hint = f"based on the provided context:\n\n{context}\n\n"
        else:
            source_hint = "using your general knowledge. "

        instruction = f"""Generate {num_questions} multiple-choice questions about '{topic}' {source_hint}
IMPORTANT: Return ONLY a valid JSON array with no additional text, markdown formatting, or code blocks.

Each question object must have these exact fields:
- question: (string) The question text
- options: (array of exactly 4 strings) The answer choices
- correct_index: (number 0-3) Index of the correct answer in the options array
- explanation: (string) Brief explanation of why the answer is correct

Example format:
[
  {{
    "question": "What is X?",
    "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correct_index": 1,
    "explanation": "Choice B is correct because..."
  }}
]"""

        raw = self.ai_service.answer_from_context(
            context_chunks=[context] if context else [],
            question=instruction,
            chat_history=[],
            model_override=model_override,
        )
        content = self._parse_json_array(raw, "quiz", session_id)

        return {
            "artifact_type": "quiz",
            "content": content,
            "topic": topic,
            "interactive": True,
        }

    def _create_study_guide(self, args: dict, session_id: str, user_id: int) -> dict:
        topic = args.get("topic", "general knowledge")
        depth = args.get("depth", "standard")
        model_override = args.get("model")

        result = self.rag_service.query(topic, session_id, user_id, n_results=8)
        chunks = result.get("chunks", [])
        logger.info(f"create_study_guide: session={session_id} chunks_retrieved={len(chunks)} topic={topic!r}")
        context = "\n\n".join(chunks)

        instruction = f"Create a {depth} study guide about '{topic}'. Include: overview, key concepts, detailed notes, review questions. Use Markdown formatting."
        content = self.ai_service.answer_from_context(
            context_chunks=[context] if context else [],
            question=instruction,
            chat_history=[],
            model_override=model_override,
        )

        return {
            "artifact_type": "study_guide",
            "content": content,
            "topic": topic,
            "depth": depth,
        }

    def _generate_visualization(self, args: dict, session_id: str, user_id: int) -> dict:
        description = args.get("description", "")
        viz_type = args.get("type", "mermaid")
        model_override = args.get("model")

        result = self.rag_service.query(description, session_id, user_id, n_results=5)
        context = "\n\n".join(result.get("chunks", []))

        if viz_type == "mermaid":
            instruction = (
                f"Generate a Mermaid diagram for: '{description}'. "
                f"{'Use this document context:\n\n' + context if context else 'Use your general knowledge.'}\n\n"
                "Return ONLY the raw Mermaid code — no markdown fences, no explanation, no extra text."
            )
        elif viz_type == "table":
            instruction = (
                f"Generate a Markdown table for: '{description}'. "
                f"{'Use this document context:\n\n' + context if context else 'Use your general knowledge.'}\n\n"
                "Return ONLY the Markdown table."
            )
        else:
            instruction = (
                f"Generate code for: '{description}'. "
                f"{'Use this document context:\n\n' + context if context else 'Use your general knowledge.'}\n\n"
                "Return ONLY the code."
            )

        content = self.ai_service.answer_from_context(
            context_chunks=[context] if context else [],
            question=instruction,
            chat_history=[],
            model_override=model_override,
        )

        # Strip any accidental markdown fences from mermaid output
        if content and viz_type == "mermaid":
            content = re.sub(r'```mermaid\s*', '', content).strip().rstrip('`').strip()

        return {
            "artifact_type": "visualization",
            "viz_type": viz_type,
            "content": content,
            "description": description,
        }

    def _generate_flashcards(self, args: dict, session_id: str, user_id: int) -> dict:
        topic = args.get("topic", "general knowledge")
        num_cards = min(args.get("num_cards", 10), 20)
        card_type = args.get("card_type", "mixed")
        model_override = args.get("model")

        # Search for relevant content; fall back to general knowledge if none found
        result = self.rag_service.query(topic, session_id, user_id, n_results=8)
        chunks = result.get("chunks", [])
        logger.info(f"generate_flashcards: session={session_id} chunks_retrieved={len(chunks)} topic={topic!r}")
        context = "\n\n".join(chunks)

        card_type_instructions = {
            "definition": "Focus on term definitions and meanings.",
            "concept": "Focus on explaining key concepts and theories.",
            "fact": "Focus on specific facts, dates, and data points.",
            "mixed": "Include a variety of definitions, concepts, and facts.",
        }

        if context:
            source_hint = f"based on the provided context:\n\n{context}\n\n"
        else:
            source_hint = "using your general knowledge. "

        instruction = f"""Generate {num_cards} flashcards about '{topic}' {source_hint}
{card_type_instructions.get(card_type, '')}

IMPORTANT: Return ONLY a valid JSON array with no additional text, markdown formatting, or code blocks.

Each flashcard object must have these exact fields:
- front: (string) The question or prompt (keep concise, under 100 characters)
- back: (string) The answer or explanation (can be longer, but clear and focused)
- difficulty: (string) "easy", "medium", or "hard"
- tags: (array of strings) 1-3 relevant tags for categorization

Example format:
[
  {{
    "front": "What is X?",
    "back": "X is defined as...",
    "difficulty": "medium",
    "tags": ["concept", "fundamentals"]
  }}
]"""

        raw = self.ai_service.answer_from_context(
            context_chunks=[context] if context else [],
            question=instruction,
            chat_history=[],
            model_override=model_override,
        )
        content = self._parse_json_array(raw, "flashcards", session_id)

        return {
            "artifact_type": "flashcards",
            "content": content,
            "topic": topic,
            "card_type": card_type,
        }

    # ── Shared helpers ──────────────────────────────────────────────────────────

    def _parse_json_array(self, raw: Optional[str], artifact_type: str, session_id: str) -> Optional[List]:
        """Extract and parse the first valid JSON array from a raw AI response string."""
        if not raw:
            logger.warning(f"_parse_json_array: empty raw response type={artifact_type} session={session_id}")
            return None

        # Strip markdown code fences if present
        cleaned = re.sub(r'```(?:json)?\s*', '', raw).strip().rstrip('```').strip()

        # Try the whole string first (ideal case: AI returned bare JSON)
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                logger.info(f"_parse_json_array: success type={artifact_type} items={len(parsed)}")
                return parsed
        except json.JSONDecodeError:
            pass

        # Walk [ ... ] spans and pick the first valid array
        for m in re.finditer(r'\[', raw):
            start = m.start()
            depth = 0
            for i, ch in enumerate(raw[start:], start=start):
                if ch == '[':
                    depth += 1
                elif ch == ']':
                    depth -= 1
                    if depth == 0:
                        candidate = raw[start:i + 1]
                        try:
                            parsed = json.loads(candidate)
                            if isinstance(parsed, list) and len(parsed) > 0:
                                logger.info(f"_parse_json_array: extracted type={artifact_type} items={len(parsed)}")
                                return parsed
                        except json.JSONDecodeError:
                            pass
                        break

        logger.error(f"_parse_json_array: no valid array found type={artifact_type} raw_len={len(raw)}")
        return None
