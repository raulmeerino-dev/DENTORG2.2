"""soft delete for patient documents

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-23
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0039"
down_revision: str | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documentos_paciente", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("documentos_paciente", sa.Column("deleted_by_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documentos_paciente", sa.Column("delete_reason", sa.Text(), nullable=True))
    op.create_index("ix_documentos_paciente_deleted_at", "documentos_paciente", ["deleted_at"])
    op.create_foreign_key(
        "fk_documentos_paciente_deleted_by_id",
        "documentos_paciente",
        "usuarios",
        ["deleted_by_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_documentos_paciente_deleted_by_id", "documentos_paciente", type_="foreignkey")
    op.drop_index("ix_documentos_paciente_deleted_at", table_name="documentos_paciente")
    op.drop_column("documentos_paciente", "delete_reason")
    op.drop_column("documentos_paciente", "deleted_by_id")
    op.drop_column("documentos_paciente", "deleted_at")
