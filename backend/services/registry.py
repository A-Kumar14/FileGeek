"""
services/registry.py — Module-level service singletons shared across all routers.
Import from here instead of re-instantiating in each module.
"""

from services.ai_service import AIService
from services.file_service import FileService
from services.rag_service import RAGService, MemoryService
from services.tools import ToolExecutor

ai_service = AIService()
file_service = FileService()
rag_service = RAGService(ai_service, file_service)
memory_service = MemoryService(ai_service)
tool_executor = ToolExecutor(rag_service, ai_service)
