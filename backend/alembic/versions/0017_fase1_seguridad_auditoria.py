"""Fase 1: permisos, roles ampliados y auditoria multi-clinica.

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-29
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'auxiliar'")
    op.execute("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'paciente'")

    op.alter_column("audit_log", "accion", type_=sa.String(length=80), existing_nullable=False)
    op.alter_column("audit_log", "tabla", type_=sa.String(length=80), existing_nullable=False)
    op.add_column("audit_log", sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("audit_log", sa.Column("user_agent", sa.String(length=500), nullable=True))
    op.create_index("ix_audit_log_clinica_id", "audit_log", ["clinica_id"])
    op.create_foreign_key("fk_audit_log_clinica_id_clinicas", "audit_log", "clinicas", ["clinica_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_audit_log_clinica_id_clinicas", "audit_log", type_="foreignkey")
    op.drop_index("ix_audit_log_clinica_id", table_name="audit_log")
    op.drop_column("audit_log", "user_agent")
    op.drop_column("audit_log", "clinica_id")
    op.alter_column("audit_log", "tabla", type_=sa.String(length=50), existing_nullable=False)
    op.alter_column("audit_log", "accion", type_=sa.String(length=10), existing_nullable=False)
    # PostgreSQL no soporta eliminar valores de enum de forma segura sin recrear el tipo.
