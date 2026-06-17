"""fix notas dentales id default

Revision ID: 0036
Revises: 0035
Create Date: 2026-06-17
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "notas_dentales",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
        server_default=sa.text("uuid_generate_v4()"),
    )


def downgrade() -> None:
    op.alter_column(
        "notas_dentales",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
        server_default=None,
    )
