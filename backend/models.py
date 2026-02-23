import uuid
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _uuid():
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sessions = db.relationship("StudySession", backref="user", lazy="dynamic")


class StudySession(db.Model):
    __tablename__ = "study_sessions"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(255), default="Untitled Session")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = db.relationship(
        "ChatMessage", backref="session", lazy="dynamic",
        cascade="all, delete-orphan",
    )
    documents = db.relationship(
        "SessionDocument", backref="session", lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_messages=False, include_documents=False):
        d = {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_messages:
            d["messages"] = [m.to_dict() for m in self.messages.order_by(ChatMessage.created_at)]
        if include_documents:
            d["documents"] = [doc.to_dict() for doc in self.documents]
        return d


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey("study_sessions.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # user | assistant
    content = db.Column(db.Text, nullable=False)
    sources_json = db.Column(db.Text, default="[]")
    artifacts_json = db.Column(db.Text, default="[]")
    suggestions_json = db.Column(db.Text, default="[]")
    feedback = db.Column(db.String(10), nullable=True)  # up | down | null
    tool_calls_json = db.Column(db.Text, default="[]")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
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


class SessionDocument(db.Model):
    __tablename__ = "session_documents"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey("study_sessions.id"), nullable=False)
    file_name = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(20), nullable=False)
    file_url = db.Column(db.Text, nullable=True)
    chroma_document_id = db.Column(db.String(255), nullable=True)
    chunk_count = db.Column(db.Integer, default=0)
    page_count = db.Column(db.Integer, default=0)
    indexed_at = db.Column(db.DateTime, default=datetime.utcnow)

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


class QuizResult(db.Model):
    """Stores quiz completion results for progress tracking and analytics"""
    __tablename__ = "quiz_results"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey("study_sessions.id"), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey("chat_messages.id"), nullable=False)
    topic = db.Column(db.String(255), nullable=False)
    score = db.Column(db.Integer, nullable=False)  # Number of correct answers
    total_questions = db.Column(db.Integer, nullable=False)
    answers_json = db.Column(db.Text, default="[]")  # User's selected answers
    time_taken = db.Column(db.Integer, nullable=True)  # Time in seconds
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            "id": self.id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "topic": self.topic,
            "score": self.score,
            "total_questions": self.total_questions,
            "answers": json.loads(self.answers_json or "[]"),
            "time_taken": self.time_taken,
            "percentage": round((self.score / self.total_questions * 100), 1) if self.total_questions > 0 else 0,
            "created_at": self.created_at.isoformat(),
        }


class FlashcardProgress(db.Model):
    """Stores flashcard review progress for spaced repetition"""
    __tablename__ = "flashcard_progress"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey("study_sessions.id"), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey("chat_messages.id"), nullable=False)
    card_index = db.Column(db.Integer, nullable=False)  # Index in the flashcard array
    card_front = db.Column(db.String(255), nullable=False)  # For identification
    status = db.Column(db.String(20), default="remaining")  # remaining | reviewing | known

    # SM-2 spaced repetition algorithm fields
    ease_factor = db.Column(db.Float, default=2.5)  # Ease of recall (2.5 is default)
    interval_days = db.Column(db.Integer, default=1)  # Days until next review
    next_review_date = db.Column(db.DateTime, nullable=True)  # When to review next
    review_count = db.Column(db.Integer, default=0)  # Total times reviewed

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Unique constraint: one progress record per card per session/message
    __table_args__ = (
        db.UniqueConstraint('session_id', 'message_id', 'card_index', name='_session_message_card_uc'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "message_id": self.message_id,
            "card_index": self.card_index,
            "card_front": self.card_front,
            "status": self.status,
            "ease_factor": self.ease_factor,
            "interval_days": self.interval_days,
            "next_review_date": self.next_review_date.isoformat() if self.next_review_date else None,
            "review_count": self.review_count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
