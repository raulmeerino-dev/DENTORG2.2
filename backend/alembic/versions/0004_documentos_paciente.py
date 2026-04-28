"""documentos_paciente

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "documentos_paciente",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("nombre_original", sa.String(255), nullable=False),
        sa.Column("nombre_guardado", sa.String(255), nullable=False),
        sa.Column("ruta", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column("categoria", sa.String(50), nullable=False, server_default="otro"),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_documentos_paciente_paciente_id", "documentos_paciente", ["paciente_id"])
    op.create_index("ix_documentos_paciente_categoria", "documentos_paciente", ["categoria"])


def downgrade() -> None:
    op.drop_table("documentos_paciente")
