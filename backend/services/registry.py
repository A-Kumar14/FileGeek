"""
services/registry.py — Module-level service singletons.

ZERO chromadb imports.  This is the fix for the gunicorn multi-worker crash:
  chromadb.errors.InternalError: database is locked
  (caused by two workers simultaneously opening the same SQLite file)

All heavy work (API clients, DB connections) is deferred to first use —
no I/O at import time.
"""

from services.embeddings import EmbeddingService
from services.file_service import FileService
from services.vector_store import VectorStore
from services.rag_service import RAGService
from services.memory_service import MemoryService
from services.llm import LLMService
from services.chat_engine import ChatEngine
from services.tools import ToolExecutor
from services.ai_service import AIService

embedding_service = EmbeddingService()
file_service = FileService()
vector_store = VectorStore(embedding_service)
rag_service = RAGService(vector_store, file_service, embedding_service)
memory_service = MemoryService(embedding_service)
llm_service = LLMService()
# ai_service created before tool_executor so it can be passed in
# (ToolExecutor calls ai_service.answer_from_context for quiz/study-guide/flashcard tools)
ai_service = AIService()
tool_executor = ToolExecutor(rag_service, ai_service)
chat_engine = ChatEngine(llm_service, vector_store, embedding_service, tool_executor)
