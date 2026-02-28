"""Add session_type column to study_sessions.

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "study_sessions",
        sa.Column("session_type", sa.Text(), nullable=True, server_default="chat"),
    )


def downgrade() -> None:
    op.drop_column("study_sessions", "session_type")
