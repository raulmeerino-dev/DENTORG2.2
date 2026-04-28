"""Fija default UUID para registro_eventos_sif.

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "registro_eventos_sif",
        "id",
        server_default=sa.text("uuid_generate_v4()"),
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "registro_eventos_sif",
        "id",
        server_default=None,
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
    )
