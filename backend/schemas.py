"""Pydantic v2 request/response schemas for FastAPI."""

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class SignupRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=1)
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SessionCreate(BaseModel):
    title: str = "Untitled Session"
    session_type: str = "chat"


class DocumentCreate(BaseModel):
    url: str  # NOT HttpUrl — UploadThing URLs are non-standard
    name: str = "document"


class ChatMessageCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    question: str = Field(min_length=1)
    deepThink: bool = False
    model: Optional[str] = None
    async_: bool = Field(False, alias="async")


class FeedbackCreate(BaseModel):
    feedback: str  # "up" | "down"


class FlashcardProgressCreate(BaseModel):
    session_id: str
    message_id: int
    card_index: int
    card_front: str = ""
    status: str = "remaining"  # remaining | reviewing | known


class QuizResultCreate(BaseModel):
    session_id: str
    message_id: int
    topic: str = "General"
    score: int
    total_questions: int
    answers: list = []
    time_taken: Optional[int] = None


class S3PresignRequest(BaseModel):
    fileName: str = "file"
    contentType: str = "application/octet-stream"

class ExploreRequest(BaseModel):
    question: str = Field(min_length=1)


class ExploreSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    session_id: Optional[str] = None


class TTSRequest(BaseModel):
    text: str


class ExportRequest(BaseModel):
    title: str = "FileGeek Export"
    content: str


class NotionExportRequest(BaseModel):
    title: str = "FileGeek Export"
    content: str
