"""sesion clinica items - persistencia de la sesion activa

Revision ID: 0032
Revises: 0031
Create Date: 2026-05-21
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    estado_enum = postgresql.ENUM(
        "planificado",
        "en_curso",
        "pospuesto",
        "realizado",
        name="estado_sesion_item",
        create_type=False,
    )
    origen_enum = postgresql.ENUM(
        "manual",
        "cita",
        "presupuesto_linea",
        name="origen_sesion_item",
        create_type=False,
    )
    estado_enum.create(op.get_bind(), checkfirst=True)
    origen_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "sesion_clinica_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("paciente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tratamiento_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("presupuesto_linea_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cita_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("historial_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("titulo", sa.String(length=200), nullable=True),
        sa.Column("pieza_dental", sa.SmallInteger(), nullable=True),
        sa.Column("caras", sa.String(length=10), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column("estado", estado_enum, nullable=False, server_default="planificado"),
        sa.Column("origen", origen_enum, nullable=False, server_default="manual"),
        sa.Column("orden", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["paciente_id"], ["pacientes.id"]),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctores.id"]),
        sa.ForeignKeyConstraint(["tratamiento_id"], ["tratamientos_catalogo.id"]),
        sa.ForeignKeyConstraint(["presupuesto_linea_id"], ["presupuesto_lineas.id"]),
        sa.ForeignKeyConstraint(["cita_id"], ["citas.id"]),
        sa.ForeignKeyConstraint(["historial_id"], ["historial_clinico.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sesion_clinica_items_paciente_id", "sesion_clinica_items", ["paciente_id"])
    op.create_index("ix_sesion_clinica_items_clinica_id", "sesion_clinica_items", ["clinica_id"])
    op.create_index("ix_sesion_clinica_items_doctor_id", "sesion_clinica_items", ["doctor_id"])
    op.create_index("ix_sesion_clinica_items_tratamiento_id", "sesion_clinica_items", ["tratamiento_id"])
    op.create_index("ix_sesion_clinica_items_presupuesto_linea_id", "sesion_clinica_items", ["presupuesto_linea_id"])
    op.create_index("ix_sesion_clinica_items_cita_id", "sesion_clinica_items", ["cita_id"])
    op.create_index("ix_sesion_clinica_items_historial_id", "sesion_clinica_items", ["historial_id"])
    op.create_index("ix_sesion_clinica_items_estado", "sesion_clinica_items", ["estado"])
    op.create_index("ix_sesion_clinica_items_origen", "sesion_clinica_items", ["origen"])
    op.create_index(
        "ix_sesion_clinica_items_paciente_estado",
        "sesion_clinica_items",
        ["paciente_id", "estado"],
    )


def downgrade() -> None:
    op.drop_index("ix_sesion_clinica_items_paciente_estado", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_origen", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_estado", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_historial_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_cita_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_presupuesto_linea_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_tratamiento_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_doctor_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_clinica_id", table_name="sesion_clinica_items")
    op.drop_index("ix_sesion_clinica_items_paciente_id", table_name="sesion_clinica_items")
    op.drop_table("sesion_clinica_items")

    bind = op.get_bind()
    sa.Enum(name="origen_sesion_item").drop(bind, checkfirst=True)
    sa.Enum(name="estado_sesion_item").drop(bind, checkfirst=True)
