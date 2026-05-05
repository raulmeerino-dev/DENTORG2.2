"""odontograma profesional

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "odontogramas",
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_odontogramas_activo", "odontogramas", ["activo"])
    op.create_index("ix_odontogramas_clinica_id", "odontogramas", ["clinica_id"])
    op.create_index("ix_odontogramas_paciente_id", "odontogramas", ["paciente_id"])

    op.create_table(
        "odontograma_piezas",
        sa.Column("odontograma_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pieza_fdi", sa.SmallInteger(), nullable=False),
        sa.Column("estado_general", sa.String(length=40), nullable=False, server_default="sano"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["odontograma_id"], ["odontogramas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("odontograma_id", "pieza_fdi", name="uq_odontograma_pieza"),
    )
    op.create_index("ix_odontograma_piezas_estado_general", "odontograma_piezas", ["estado_general"])
    op.create_index("ix_odontograma_piezas_odontograma_id", "odontograma_piezas", ["odontograma_id"])
    op.create_index("ix_odontograma_piezas_pieza_fdi", "odontograma_piezas", ["pieza_fdi"])

    op.create_table(
        "odontograma_superficies",
        sa.Column("pieza_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("superficie", sa.String(length=30), nullable=False),
        sa.Column("condicion", sa.String(length=40), nullable=False, server_default="sano"),
        sa.Column("tratamiento_planificado_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tratamiento_realizado_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("color_estado", sa.String(length=20), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["pieza_id"], ["odontograma_piezas.id"]),
        sa.ForeignKeyConstraint(["tratamiento_planificado_id"], ["tratamientos_catalogo.id"]),
        sa.ForeignKeyConstraint(["tratamiento_realizado_id"], ["historial_clinico.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pieza_id", "superficie", name="uq_odontograma_superficie"),
    )
    op.create_index("ix_odontograma_superficies_condicion", "odontograma_superficies", ["condicion"])
    op.create_index("ix_odontograma_superficies_pieza_id", "odontograma_superficies", ["pieza_id"])

    op.create_table(
        "odontograma_eventos",
        sa.Column("odontograma_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pieza_fdi", sa.SmallInteger(), nullable=True),
        sa.Column("superficie", sa.String(length=30), nullable=True),
        sa.Column("accion", sa.String(length=80), nullable=False),
        sa.Column("old_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.ForeignKeyConstraint(["odontograma_id"], ["odontogramas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_odontograma_eventos_odontograma_id", "odontograma_eventos", ["odontograma_id"])
    op.create_index("ix_odontograma_eventos_pieza_fdi", "odontograma_eventos", ["pieza_fdi"])


def downgrade() -> None:
    op.drop_index("ix_odontograma_eventos_pieza_fdi", table_name="odontograma_eventos")
    op.drop_index("ix_odontograma_eventos_odontograma_id", table_name="odontograma_eventos")
    op.drop_table("odontograma_eventos")
    op.drop_index("ix_odontograma_superficies_pieza_id", table_name="odontograma_superficies")
    op.drop_index("ix_odontograma_superficies_condicion", table_name="odontograma_superficies")
    op.drop_table("odontograma_superficies")
    op.drop_index("ix_odontograma_piezas_pieza_fdi", table_name="odontograma_piezas")
    op.drop_index("ix_odontograma_piezas_odontograma_id", table_name="odontograma_piezas")
    op.drop_index("ix_odontograma_piezas_estado_general", table_name="odontograma_piezas")
    op.drop_table("odontograma_piezas")
    op.drop_index("ix_odontogramas_paciente_id", table_name="odontogramas")
    op.drop_index("ix_odontogramas_clinica_id", table_name="odontogramas")
    op.drop_index("ix_odontogramas_activo", table_name="odontogramas")
    op.drop_table("odontogramas")
