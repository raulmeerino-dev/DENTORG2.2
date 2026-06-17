"""add facturado estado presupuesto

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-17
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_presupuesto ADD VALUE IF NOT EXISTS 'facturado'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely without recreating
    # the type and rewriting dependent columns. Keep this downgrade as a no-op.
    pass
