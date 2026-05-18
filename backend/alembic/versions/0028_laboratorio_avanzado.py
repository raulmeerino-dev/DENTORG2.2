"""laboratorio avanzado

Revision ID: 0028
Revises: 0027
Create Date: 2026-05-18

Añade campos administrativos al modelo TrabajoLaboratorio:
- numero_orden: secuencia (auto-asignado en backend al crear)
- referencia_interna: referencia interna de la clinica
- referencia_proveedor: referencia que asigna el laboratorio
- colocado, material_enviado, material_devuelto: flags operativos
- presupuesto_linea_id: FK opcional a la linea de presupuesto que originó el pedido

`referencia` legacy se conserva (alias de referencia_proveedor para datos antiguos).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("trabajos_laboratorio", sa.Column("numero_orden", sa.Integer(), nullable=True))
    op.create_index(
        "ix_trabajos_laboratorio_numero_orden",
        "trabajos_laboratorio",
        ["numero_orden"],
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("referencia_interna", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("referencia_proveedor", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("colocado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("material_enviado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("material_devuelto", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "trabajos_laboratorio",
        sa.Column("presupuesto_linea_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_trabajos_lab_presupuesto_linea",
        "trabajos_laboratorio",
        "presupuesto_lineas",
        ["presupuesto_linea_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_trabajos_lab_presupuesto_linea",
        "trabajos_laboratorio",
        ["presupuesto_linea_id"],
    )

    # Quitar defaults despues de rellenar filas existentes
    op.alter_column("trabajos_laboratorio", "colocado", server_default=None)
    op.alter_column("trabajos_laboratorio", "material_enviado", server_default=None)
    op.alter_column("trabajos_laboratorio", "material_devuelto", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_trabajos_lab_presupuesto_linea", table_name="trabajos_laboratorio")
    op.drop_constraint("fk_trabajos_lab_presupuesto_linea", "trabajos_laboratorio", type_="foreignkey")
    op.drop_column("trabajos_laboratorio", "presupuesto_linea_id")
    op.drop_column("trabajos_laboratorio", "material_devuelto")
    op.drop_column("trabajos_laboratorio", "material_enviado")
    op.drop_column("trabajos_laboratorio", "colocado")
    op.drop_column("trabajos_laboratorio", "referencia_proveedor")
    op.drop_column("trabajos_laboratorio", "referencia_interna")
    op.drop_index("ix_trabajos_laboratorio_numero_orden", table_name="trabajos_laboratorio")
    op.drop_column("trabajos_laboratorio", "numero_orden")
