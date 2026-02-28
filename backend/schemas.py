"""Pydantic v2 request/response schemas for FastAPI."""

import re
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


class SignupRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=1)
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        v = v.strip().lower()
        parts = v.split("@")
        if len(parts) != 2 or not parts[0] or "." not in parts[1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v


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
