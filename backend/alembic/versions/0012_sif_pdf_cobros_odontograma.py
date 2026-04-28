"""Endurece SIF, PDFs fiscales, cobros y odontograma.

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "presupuestos",
        sa.Column(
            "odontograma",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.alter_column("presupuestos", "odontograma", server_default=None)

    op.add_column("cobros", sa.Column("anulado_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cobros", sa.Column("anulado_por_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("cobros", sa.Column("motivo_anulacion", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_cobros_anulado_por_id_usuarios",
        "cobros",
        "usuarios",
        ["anulado_por_id"],
        ["id"],
    )

    op.create_table(
        "documentos_fiscales",
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("ruta", sa.String(length=500), nullable=False),
        sa.Column("hash_pdf", sa.String(length=64), nullable=False),
        sa.Column("plantilla_version", sa.String(length=30), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documentos_fiscales_factura_id", "documentos_fiscales", ["factura_id"])
    op.create_index("ix_documentos_fiscales_paciente_id", "documentos_fiscales", ["paciente_id"])
    op.create_index("ix_documentos_fiscales_hash_pdf", "documentos_fiscales", ["hash_pdf"])

    op.create_unique_constraint(
        "uq_registro_facturacion_serie_secuencia",
        "registros_facturacion",
        ["serie", "secuencia"],
    )
    op.create_unique_constraint(
        "uq_registro_facturacion_factura_tipo",
        "registros_facturacion",
        ["factura_id", "tipo_registro"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_registro_facturacion_factura_tipo", "registros_facturacion", type_="unique")
    op.drop_constraint("uq_registro_facturacion_serie_secuencia", "registros_facturacion", type_="unique")
    op.drop_index("ix_documentos_fiscales_hash_pdf", table_name="documentos_fiscales")
    op.drop_index("ix_documentos_fiscales_paciente_id", table_name="documentos_fiscales")
    op.drop_index("ix_documentos_fiscales_factura_id", table_name="documentos_fiscales")
    op.drop_table("documentos_fiscales")
    op.drop_constraint("fk_cobros_anulado_por_id_usuarios", "cobros", type_="foreignkey")
    op.drop_column("cobros", "motivo_anulacion")
    op.drop_column("cobros", "anulado_por_id")
    op.drop_column("cobros", "anulado_at")
    op.drop_column("presupuestos", "odontograma")
