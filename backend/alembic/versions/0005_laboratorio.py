"""laboratorio

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "laboratorios",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("telefono", sa.String(30), nullable=True),
        sa.Column("whatsapp", sa.String(30), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("contacto", sa.String(150), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    op.create_table(
        "trabajos_laboratorio",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("doctor_id", UUID(as_uuid=True), sa.ForeignKey("doctores.id"), nullable=False),
        sa.Column("laboratorio_id", UUID(as_uuid=True), sa.ForeignKey("laboratorios.id"), nullable=False),
        sa.Column("historial_id", UUID(as_uuid=True), sa.ForeignKey("historial_clinico.id"), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("pieza_dental", sa.SmallInteger(), nullable=True),
        sa.Column("color", sa.String(50), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column("fecha_salida", sa.Date(), nullable=True),
        sa.Column("fecha_entrega_prevista", sa.Date(), nullable=True),
        sa.Column("fecha_recepcion", sa.Date(), nullable=True),
        sa.Column("fecha_entrega_paciente", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("precio", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_trabajos_lab_paciente_id", "trabajos_laboratorio", ["paciente_id"])
    op.create_index("ix_trabajos_lab_laboratorio_id", "trabajos_laboratorio", ["laboratorio_id"])
    op.create_index("ix_trabajos_lab_estado", "trabajos_laboratorio", ["estado"])


def downgrade() -> None:
    op.drop_table("trabajos_laboratorio")
    op.drop_table("laboratorios")
