"""Cifra datos de salud y crea registro de eventos SIF.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.config import get_settings


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    settings = get_settings()
    bind = op.get_bind()

    op.add_column("pacientes", sa.Column("datos_salud_cifrado", sa.LargeBinary(), nullable=True))

    bind.execute(
        sa.text(
            """
        UPDATE pacientes
        SET datos_salud_cifrado = pgp_sym_encrypt(
            datos_salud::text,
            :key
        )
        WHERE datos_salud IS NOT NULL
        """
        ),
        {"key": settings.db_encryption_key},
    )
    op.execute("UPDATE pacientes SET datos_salud = NULL WHERE datos_salud IS NOT NULL")

    op.create_table(
        "registro_eventos_sif",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("tipo_evento", sa.String(length=50), nullable=False),
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sistema_codigo", sa.String(length=50), nullable=False),
        sa.Column("sistema_version", sa.String(length=20), nullable=False),
        sa.Column("detalles", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_registro_eventos_sif_created_at"), "registro_eventos_sif", ["created_at"], unique=False)
    op.create_index(op.f("ix_registro_eventos_sif_factura_id"), "registro_eventos_sif", ["factura_id"], unique=False)
    op.create_index(op.f("ix_registro_eventos_sif_tipo_evento"), "registro_eventos_sif", ["tipo_evento"], unique=False)
    op.create_index(op.f("ix_registro_eventos_sif_usuario_id"), "registro_eventos_sif", ["usuario_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_registro_eventos_sif_usuario_id"), table_name="registro_eventos_sif")
    op.drop_index(op.f("ix_registro_eventos_sif_tipo_evento"), table_name="registro_eventos_sif")
    op.drop_index(op.f("ix_registro_eventos_sif_factura_id"), table_name="registro_eventos_sif")
    op.drop_index(op.f("ix_registro_eventos_sif_created_at"), table_name="registro_eventos_sif")
    op.drop_table("registro_eventos_sif")
    op.drop_column("pacientes", "datos_salud_cifrado")
