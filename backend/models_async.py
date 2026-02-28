"""SQLAlchemy 2.x models (async-compatible) for FastAPI.

Note: models.py (Flask-SQLAlchemy legacy models) was removed. All ORM models
live here. Legacy files auth.py, app.py, and tasks/message_tasks.py that
imported from models.py are themselves dead code from the Flask era.
"""

import json
import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean, Integer, String, Text, Float, DateTime, LargeBinary,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[List["StudySession"]] = relationship(
        "StudySession", back_populates="user", cascade="all, delete-orphan"
    )


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="Untitled Session")
    session_type: Mapped[str] = mapped_column(String(20), default="chat", server_default="chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    messages: Mapped[List["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan"
    )
    documents: Mapped[List["SessionDocument"]] = relationship(
        "SessionDocument", back_populates="session", cascade="all, delete-orphan"
    )

    def to_dict(self, include_messages=False, include_documents=False):
        d = {
            "id": self.id,
            "title": self.title,
            "session_type": self.session_type or "chat",
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_messages:
            d["messages"] = [
                m.to_dict()
                for m in sorted(self.messages, key=lambda x: x.created_at)
            ]
        if include_documents:
            d["documents"] = [doc.to_dict() for doc in self.documents]
        return d


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_sessions.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources_json: Mapped[str] = mapped_column(Text, default="[]")
    artifacts_json: Mapped[str] = mapped_column(Text, default="[]")
    suggestions_json: Mapped[str] = mapped_column(Text, default="[]")
    feedback: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    tool_calls_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["StudySession"] = relationship("StudySession", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "sources": json.loads(self.sources_json or "[]"),
            "artifacts": json.loads(self.artifacts_json or "[]"),
            "suggestions": json.loads(self.suggestions_json or "[]"),
            "feedback": self.feedback,
            "created_at": self.created_at.isoformat(),
        }


class SessionDocument(Base):
    __tablename__ = "session_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_sessions.id"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chroma_document_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    indexed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["StudySession"] = relationship("StudySession", back_populates="documents")

    def to_dict(self):
        return {
            "id": self.id,
            "file_name": self.file_name,
            "file_type": self.file_type,
            "file_url": self.file_url,
            "chunk_count": self.chunk_count,
            "page_count": self.page_count,
            "indexed_at": self.indexed_at.isoformat() if self.indexed_at else None,
        }


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_sessions.id"), nullable=False
    )
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("chat_messages.id"), nullable=False
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    answers_json: Mapped[str] = mapped_column(Text, default="[]")
    time_taken: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "topic": self.topic,
            "score": self.score,
            "total_questions": self.total_questions,
            "answers": json.loads(self.answers_json or "[]"),
            "time_taken": self.time_taken,
            "percentage": (
                round((self.score / self.total_questions * 100), 1)
                if self.total_questions > 0
                else 0
            ),
            "created_at": self.created_at.isoformat(),
        }


class FlashcardProgress(Base):
    __tablename__ = "flashcard_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_sessions.id"), nullable=False
    )
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("chat_messages.id"), nullable=False
    )
    card_index: Mapped[int] = mapped_column(Integer, nullable=False)
    card_front: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="remaining")
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint(
            "session_id", "message_id", "card_index", name="_session_message_card_uc"
        ),
    )

    def to_dict(self):
        # Confidence 0-100: ease_factor ranges from 1.3 (min) to 2.5 (max)
        confidence_score = round(
            max(0.0, min(100.0, (self.ease_factor - 1.3) / (2.5 - 1.3) * 100))
        )
        return {
            "id": self.id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "card_index": self.card_index,
            "card_front": self.card_front,
            "status": self.status,
            "ease_factor": self.ease_factor,
            "interval_days": self.interval_days,
            "next_review_date": (
                self.next_review_date.isoformat() if self.next_review_date else None
            ),
            "review_count": self.review_count,
            "confidence_score": confidence_score,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DocumentChunk(Base):
    """One embedding chunk from an indexed document. Stored as raw float32 bytes."""
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("study_sessions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[str] = mapped_column(String(200), index=True)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)  # numpy float32 raw bytes
    pages: Mapped[Optional[str]] = mapped_column(Text, default="[]")  # JSON list of page nums
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserMemoryEntry(Base):
    """Long-term user memory stored as embeddings (replaces ChromaDB user_memory collection)."""
    __tablename__ = "user_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    feedback: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
