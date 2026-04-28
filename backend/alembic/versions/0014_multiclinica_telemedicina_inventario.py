"""Multi-clinica, telemedicina, inventario, recetas y sync.

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinicas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("direccion", sa.Text(), nullable=True),
        sa.Column("telefono", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("cif", sa.String(length=20), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_clinicas_nombre", "clinicas", ["nombre"])

    for table in ("usuarios", "pacientes", "citas", "facturas", "doctores"):
        op.add_column(table, sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(f"ix_{table}_clinica_id", table, ["clinica_id"])
        op.create_foreign_key(f"fk_{table}_clinica_id_clinicas", table, "clinicas", ["clinica_id"], ["id"])

    op.add_column("usuarios", sa.Column("two_factor_secret", sa.String(length=64), nullable=True))
    op.add_column("facturas", sa.Column("tiene_receta_electronica", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.create_table(
        "teleconsultas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="iniciada"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["cita_id"], ["citas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cita_id"),
    )
    op.create_index("ix_teleconsultas_cita_id", "teleconsultas", ["cita_id"])

    op.create_table(
        "proveedores",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("telefono", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "productos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("stock_min", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stock_act", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("proveedor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["proveedor_id"], ["proveedores.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_productos_nombre", "productos", ["nombre"])

    op.create_table(
        "recetas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contenido_base64", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("factura_id"),
    )
    op.create_index("ix_recetas_factura_id", "recetas", ["factura_id"])

    op.create_table(
        "pacientes_temp",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("id_temp", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default="pendiente"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pacientes_temp_id_temp", "pacientes_temp", ["id_temp"])


def downgrade() -> None:
    op.drop_index("ix_pacientes_temp_id_temp", table_name="pacientes_temp")
    op.drop_table("pacientes_temp")
    op.drop_index("ix_recetas_factura_id", table_name="recetas")
    op.drop_table("recetas")
    op.drop_index("ix_productos_nombre", table_name="productos")
    op.drop_table("productos")
    op.drop_table("proveedores")
    op.drop_index("ix_teleconsultas_cita_id", table_name="teleconsultas")
    op.drop_table("teleconsultas")
    op.drop_column("facturas", "tiene_receta_electronica")
    op.drop_column("usuarios", "two_factor_secret")
    for table in ("doctores", "facturas", "citas", "pacientes", "usuarios"):
        op.drop_constraint(f"fk_{table}_clinica_id_clinicas", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_clinica_id", table_name=table)
        op.drop_column(table, "clinica_id")
    op.drop_index("ix_clinicas_nombre", table_name="clinicas")
    op.drop_table("clinicas")
