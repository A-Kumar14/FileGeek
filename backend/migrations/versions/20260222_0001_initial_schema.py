"""Initial schema — baseline for all existing tables.

Revision ID: 0001
Revises:
Create Date: 2026-02-22 00:00:00.000000

This migration creates all tables from scratch.
If the database already exists (created via init_db / create_all), run:

    alembic stamp head

to mark it as up-to-date without re-running DDL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # ── study_sessions ─────────────────────────────────────────────────────────
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("persona", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])

    # ── chat_messages ──────────────────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id", sa.String(36),
            sa.ForeignKey("study_sessions.id"), nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources_json", sa.Text(), nullable=True),
        sa.Column("artifacts_json", sa.Text(), nullable=True),
        sa.Column("suggestions_json", sa.Text(), nullable=True),
        sa.Column("feedback", sa.String(10), nullable=True),
        sa.Column("tool_calls_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    # ── session_documents ──────────────────────────────────────────────────────
    op.create_table(
        "session_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id", sa.String(36),
            sa.ForeignKey("study_sessions.id"), nullable=False,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(20), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("chroma_document_id", sa.String(255), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("indexed_at", sa.DateTime(), nullable=True),
    )

    # ── quiz_results ───────────────────────────────────────────────────────────
    op.create_table(
        "quiz_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id", sa.String(36),
            sa.ForeignKey("study_sessions.id"), nullable=False,
        ),
        sa.Column(
            "message_id", sa.Integer(),
            sa.ForeignKey("chat_messages.id"), nullable=False,
        ),
        sa.Column("topic", sa.String(255), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("answers_json", sa.Text(), nullable=True),
        sa.Column("time_taken", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # ── flashcard_progress ─────────────────────────────────────────────────────
    op.create_table(
        "flashcard_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id", sa.String(36),
            sa.ForeignKey("study_sessions.id"), nullable=False,
        ),
        sa.Column(
            "message_id", sa.Integer(),
            sa.ForeignKey("chat_messages.id"), nullable=False,
        ),
        sa.Column("card_index", sa.Integer(), nullable=False),
        sa.Column("card_front", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=True),
        sa.Column("ease_factor", sa.Float(), nullable=True),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("next_review_date", sa.DateTime(), nullable=True),
        sa.Column("review_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "session_id", "message_id", "card_index",
            name="_session_message_card_uc",
        ),
    )
    op.create_index(
        "ix_flashcard_progress_next_review",
        "flashcard_progress",
        ["next_review_date"],
    )


def downgrade() -> None:
    op.drop_table("flashcard_progress")
    op.drop_table("quiz_results")
    op.drop_table("session_documents")
    op.drop_table("chat_messages")
    op.drop_table("study_sessions")
    op.drop_table("users")
