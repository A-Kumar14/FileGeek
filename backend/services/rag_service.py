import asyncio
import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional

import chromadb
from langchain_chroma import Chroma
from langchain_core.documents import Document
from config import Config

logger = logging.getLogger(__name__)


class RAGService:
    """Manages ChromaDB indexing and retrieval with session-scoped persistence."""

    def __init__(self, ai_service, file_service):
        self.ai_service = ai_service
        self.file_service = file_service

        os.makedirs(Config.CHROMA_PATH, exist_ok=True)
        self.vectorstore = Chroma(
            collection_name="document_chunks",
            persist_directory=Config.CHROMA_PATH,
            embedding_function=ai_service.embeddings,
        )
        # Keep raw collection reference for metadata-filtered deletes
        self.collection = self.vectorstore._collection

    def index_document(self, filepath: str, document_id: str, session_id: str, user_id: int) -> Dict:
        """Extract, chunk, embed, and store a local file. Returns indexing stats."""
        page_texts = self.file_service.extract_text_universal(filepath)
        if not page_texts:
            return {"chunk_count": 0, "page_count": 0, "text": ""}

        extracted_text = "\n\n".join(p["text"] for p in page_texts)
        chunks_with_pages = self.file_service.chunking_function_with_pages(page_texts)

        if chunks_with_pages:
            docs = [
                Document(
                    page_content=c["text"],
                    metadata={
                        "document_id": document_id,
                        "session_id": session_id,
                        "user_id": str(user_id),
                        "pages": json.dumps(c["pages"]),
                    },
                )
                for c in chunks_with_pages
            ]
            ids = [f"{document_id}_chunk_{i}" for i in range(len(docs))]
            self.vectorstore.add_documents(docs, ids=ids)
            logger.info(f"Indexed {len(docs)} chunks for doc={document_id} session={session_id}")

        return {
            "chunk_count": len(chunks_with_pages),
            "page_count": len(page_texts),
            "text": extracted_text,
        }

    def index_from_url(self, url: str, name: str, document_id: str, session_id: str, user_id: int) -> Dict:
        """Download a file from CDN and index it."""
        import requests as http_requests
        from werkzeug.utils import secure_filename

        filename = secure_filename(name) or "file"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(Config.UPLOAD_FOLDER, safe_filename)

        try:
            dl_resp = http_requests.get(url, timeout=30, stream=True)
            dl_resp.raise_for_status()
            with open(filepath, "wb") as fout:
                for chunk in dl_resp.iter_content(chunk_size=8192):
                    fout.write(chunk)
        except Exception as e:
            logger.error(f"Failed to download {url}: {e}")
            raise

        try:
            result = self.index_document(filepath, document_id, session_id, user_id)
            result["filepath"] = filepath
            result["file_type"] = self.file_service.detect_file_type(filepath)
            file_info = self.file_service.get_file_info(filepath)
            result["file_info"] = file_info
            return result
        finally:
            try:
                os.remove(filepath)
            except Exception:
                pass

    def query(self, question: str, session_id: str, user_id: int, n_results: int = 5) -> Dict:
        """Session-scoped retrieval. Returns chunks, metas, and image paths."""
        # Guard: skip expensive ChromaDB call when inputs are clearly invalid
        if not session_id or not str(user_id).strip():
            logger.warning("RAG query skipped: missing session_id or user_id")
            return {"chunks": [], "metas": []}
        if not question or not question.strip():
            logger.warning("RAG query skipped: empty question")
            return {"chunks": [], "metas": []}

        try:
            # Primary: compound filter by session_id AND user_id
            filter_dict = {
                "$and": [
                    {"session_id": session_id},
                    {"user_id": str(user_id)},
                ]
            }

            results = self.vectorstore.similarity_search(
                query=question,
                k=n_results,
                filter=filter_dict,
            )

            # Fallback: ChromaDB's $and can silently fail with sparse collections.
            # Retry with session_id-only filter if no chunks were returned.
            if not results:
                logger.warning(
                    f"RAG compound filter returned 0 chunks for session={session_id} "
                    f"user={user_id} — retrying with session_id-only filter"
                )
                results = self.vectorstore.similarity_search(
                    query=question,
                    k=n_results,
                    filter={"session_id": session_id},
                )

            chunks = [doc.page_content for doc in results]
            metas = [doc.metadata for doc in results]

            logger.info(
                f"RAG query: session={session_id} user={user_id} "
                f"chunks_returned={len(chunks)} question_prefix={question[:60]!r}"
            )
            return {"chunks": chunks, "metas": metas}

        except Exception as e:
            logger.warning(f"RAG query failed for session={session_id} user={user_id}: {e}")
            return {"chunks": [], "metas": []}

    def query_all_sessions(self, question: str, user_id: int, n_results: int = 5) -> Dict:
        """Cross-session retrieval: search ALL documents belonging to a user."""
        try:
            results = self.vectorstore.similarity_search(
                query=question,
                k=n_results,
                filter={"user_id": str(user_id)},
            )
            chunks = [doc.page_content for doc in results]
            metas = [doc.metadata for doc in results]
            logger.info(
                f"RAG cross-session query: user={user_id} chunks_returned={len(chunks)} "
                f"question_prefix={question[:60]!r}"
            )
            return {"chunks": chunks, "metas": metas}
        except Exception as e:
            logger.warning(f"RAG cross-session query failed: {e}")
            return {"chunks": [], "metas": []}

    def delete_session_documents(self, session_id: str, user_id: Optional[int] = None):
        """Delete all ChromaDB entries for a session.

        When user_id is provided a compound filter is applied so that only
        the calling user's chunks are removed, preventing cross-user orphans.
        Gracefully falls back to session-only filter if ChromaDB rejects
        the compound query (e.g. sparse collections).
        """
        try:
            if user_id is not None:
                where_filter = {
                    "$and": [
                        {"session_id": session_id},
                        {"user_id": str(user_id)},
                    ]
                }
                try:
                    self.collection.delete(where=where_filter)
                    logger.info(
                        f"Deleted ChromaDB docs for session={session_id} user={user_id} "
                        f"(compound filter)"
                    )
                    return
                except Exception as compound_err:
                    logger.warning(
                        f"ChromaDB compound delete failed (falling back to session-only): {compound_err}"
                    )
            # Fallback: session-only filter
            self.collection.delete(where={"session_id": session_id})
            logger.info(f"Deleted ChromaDB docs for session={session_id} (session-only filter)")
        except Exception as e:
            logger.warning(f"ChromaDB session delete failed: {e}")

    async def query_async(
        self, question: str, session_id: str, user_id: int, n_results: int = 5
    ) -> Dict:
        """Async wrapper around the sync query() method (runs in thread pool)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.query, question, session_id, user_id, n_results
        )

    async def index_from_url_async(
        self, url: str, name: str, document_id: str, session_id: str, user_id: int
    ) -> Dict:
        """Async wrapper around the sync index_from_url() method."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.index_from_url, url, name, document_id, session_id, user_id
        )

    def build_sources(self, chunks: List[str], metas: List[dict]) -> List[dict]:
        """Build source citation list from RAG results."""
        sources = []
        for i, (chunk_text, meta) in enumerate(zip(chunks, metas), start=1):
            excerpt = (chunk_text[:200] + "...") if len(chunk_text) > 200 else chunk_text
            pages = json.loads(meta.get("pages", "[]")) if meta else []
            sources.append({"index": i, "excerpt": excerpt.strip(), "pages": pages})
        return sources


class MemoryService:
    """Long-term user memory stored in a separate ChromaDB collection."""

    def __init__(self, ai_service):
        self.ai_service = ai_service
        os.makedirs(Config.CHROMA_PATH, exist_ok=True)
        self._client = chromadb.PersistentClient(path=Config.CHROMA_PATH)
        self.collection = self._client.get_or_create_collection(
            name="user_memory",
            metadata={"description": "Long-term user interaction memory"},
        )

    def store_interaction(self, user_id: int, question: str, answer: str, feedback: Optional[str] = None):
        """Store a Q&A interaction summary for future recall."""
        summary = f"Q: {question[:200]}\nA: {answer[:300]}"
        if feedback:
            summary += f"\nFeedback: {feedback}"

        try:
            embedding = self.ai_service.get_embeddings([summary])[0]
            mem_id = f"mem_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
            self.collection.add(
                ids=[mem_id],
                embeddings=[embedding],
                documents=[summary],
                metadatas=[{
                    "user_id": str(user_id),
                    "feedback": feedback or "",
                    "timestamp": datetime.utcnow().isoformat(),
                }],
            )
        except Exception as e:
            logger.warning(f"Failed to store memory: {e}")

    def retrieve_relevant_memory(self, user_id: int, question: str, n: int = 3) -> List[str]:
        """Retrieve past interactions relevant to the current question."""
        try:
            embedding = self.ai_service.get_embeddings([question])[0]
            results = self.collection.query(
                query_embeddings=[embedding],
                n_results=n,
                where={"user_id": str(user_id)},
            )
            return results["documents"][0] if results["documents"] else []
        except Exception as e:
            logger.warning(f"Memory retrieval failed: {e}")
            return []

    def get_user_preferences(self, user_id: int) -> str:
        """Aggregate feedback patterns into a preference string."""
        try:
            positive = self.collection.get(
                where={"$and": [{"user_id": str(user_id)}, {"feedback": "up"}]},
                limit=20,
            )
            negative = self.collection.get(
                where={"$and": [{"user_id": str(user_id)}, {"feedback": "down"}]},
                limit=20,
            )

            pos_count = len(positive["ids"]) if positive["ids"] else 0
            neg_count = len(negative["ids"]) if negative["ids"] else 0

            if pos_count == 0 and neg_count == 0:
                return ""

            prefs = []
            if pos_count > 0:
                pos_docs = positive["documents"][:5] if positive["documents"] else []
                prefs.append(f"User liked responses like: {'; '.join(d[:80] for d in pos_docs)}")
            if neg_count > 0:
                neg_docs = negative["documents"][:5] if negative["documents"] else []
                prefs.append(f"User disliked responses like: {'; '.join(d[:80] for d in neg_docs)}")

            return " | ".join(prefs)
        except Exception as e:
            logger.warning(f"Preference aggregation failed: {e}")
            return ""
