"""add staff clock-in records

Revision ID: 0043
Revises: 0042
Create Date: 2026-06-25
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0043"
down_revision: str | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


tipo_fichaje = sa.Enum("entrada", "salida", name="tipo_fichaje")
origen_trabajador = sa.Enum("trabajador", "usuario", name="origen_trabajador_fichaje")


def upgrade() -> None:
    tipo_fichaje.create(op.get_bind(), checkfirst=True)
    origen_trabajador.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "trabajadores",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("codigo", sa.String(length=50), nullable=True),
        sa.Column("rol", sa.String(length=30), nullable=True),
        sa.Column("pin_hash", sa.String(length=255), nullable=True),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctores.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trabajadores_codigo", "trabajadores", ["codigo"])
    op.create_index("ix_trabajadores_clinica_id", "trabajadores", ["clinica_id"])
    op.create_index("ix_trabajadores_usuario_id", "trabajadores", ["usuario_id"])
    op.create_index("ix_trabajadores_doctor_id", "trabajadores", ["doctor_id"])

    op.create_table(
        "fichajes_trabajadores",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trabajador_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trabajador_origen", origen_trabajador, nullable=False),
        sa.Column("trabajador_nombre", sa.String(length=100), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("hora_exacta", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", tipo_fichaje, nullable=False),
        sa.Column("equipo", sa.String(length=120), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("registrado_por_usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["registrado_por_usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fichajes_trabajadores_trabajador_id", "fichajes_trabajadores", ["trabajador_id"])
    op.create_index("ix_fichajes_trabajadores_clinica_id", "fichajes_trabajadores", ["clinica_id"])
    op.create_index("ix_fichajes_trabajadores_fecha", "fichajes_trabajadores", ["fecha"])
    op.create_index("ix_fichajes_trabajadores_hora_exacta", "fichajes_trabajadores", ["hora_exacta"])
    op.create_index(
        "ix_fichajes_trabajadores_registrado_por_usuario_id",
        "fichajes_trabajadores",
        ["registrado_por_usuario_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_fichajes_trabajadores_registrado_por_usuario_id", table_name="fichajes_trabajadores")
    op.drop_index("ix_fichajes_trabajadores_hora_exacta", table_name="fichajes_trabajadores")
    op.drop_index("ix_fichajes_trabajadores_fecha", table_name="fichajes_trabajadores")
    op.drop_index("ix_fichajes_trabajadores_clinica_id", table_name="fichajes_trabajadores")
    op.drop_index("ix_fichajes_trabajadores_trabajador_id", table_name="fichajes_trabajadores")
    op.drop_table("fichajes_trabajadores")

    op.drop_index("ix_trabajadores_doctor_id", table_name="trabajadores")
    op.drop_index("ix_trabajadores_usuario_id", table_name="trabajadores")
    op.drop_index("ix_trabajadores_clinica_id", table_name="trabajadores")
    op.drop_index("ix_trabajadores_codigo", table_name="trabajadores")
    op.drop_table("trabajadores")

    origen_trabajador.drop(op.get_bind(), checkfirst=True)
    tipo_fichaje.drop(op.get_bind(), checkfirst=True)
