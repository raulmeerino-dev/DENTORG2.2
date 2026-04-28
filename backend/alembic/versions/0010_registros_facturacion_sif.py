"""Crea registros append-only de facturacion SIF.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registros_facturacion",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("serie", sa.String(length=5), nullable=False),
        sa.Column("numero_factura", sa.Integer(), nullable=False),
        sa.Column("tipo_registro", sa.String(length=30), nullable=False),
        sa.Column("secuencia", sa.Integer(), nullable=False),
        sa.Column("huella_anterior", sa.String(length=64), nullable=True),
        sa.Column("huella", sa.String(length=64), nullable=False),
        sa.Column("estado_remision", sa.String(length=30), nullable=True),
        sa.Column("enviado_aeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_registros_facturacion_factura_id"), "registros_facturacion", ["factura_id"], unique=False)
    op.create_index(op.f("ix_registros_facturacion_serie"), "registros_facturacion", ["serie"], unique=False)
    op.create_index(op.f("ix_registros_facturacion_secuencia"), "registros_facturacion", ["secuencia"], unique=False)
    op.create_index(op.f("ix_registros_facturacion_huella"), "registros_facturacion", ["huella"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_registros_facturacion_huella"), table_name="registros_facturacion")
    op.drop_index(op.f("ix_registros_facturacion_secuencia"), table_name="registros_facturacion")
    op.drop_index(op.f("ix_registros_facturacion_serie"), table_name="registros_facturacion")
    op.drop_index(op.f("ix_registros_facturacion_factura_id"), table_name="registros_facturacion")
    op.drop_table("registros_facturacion")
