"""Amplia flujo clinico: agenda, consentimientos, documentos y laboratorio.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("citas", sa.Column("recordatorio_enviado", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("citas", sa.Column("recordatorio_canal", sa.String(length=20), nullable=True))
    op.add_column("citas", sa.Column("recordatorio_estado", sa.String(length=30), nullable=True))
    op.add_column("citas", sa.Column("recordatorio_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas", sa.Column("confirmado_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas", sa.Column("motivo_cancelacion", sa.String(length=80), nullable=True))

    op.add_column("citas_telefonear", sa.Column("notas", sa.Text(), nullable=True))
    op.add_column("citas_telefonear", sa.Column("estado_contacto", sa.String(length=30), nullable=False, server_default="pendiente"))
    op.add_column("citas_telefonear", sa.Column("ultimo_intento_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas_telefonear", sa.Column("proximo_intento_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_citas_telefonear_estado_contacto", "citas_telefonear", ["estado_contacto"])

    op.add_column("historial_clinico", sa.Column("diagnostico", sa.Text(), nullable=True))
    op.add_column("historial_clinico", sa.Column("procedimiento", sa.Text(), nullable=True))
    op.add_column("historial_clinico", sa.Column("estado", sa.String(length=30), nullable=False, server_default="realizado"))
    op.add_column("historial_clinico", sa.Column("importe", sa.Numeric(10, 2), nullable=True))
    op.add_column("historial_clinico", sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_historial_clinico_estado", "historial_clinico", ["estado"])
    op.create_index("ix_historial_clinico_factura_id", "historial_clinico", ["factura_id"])
    op.create_foreign_key("fk_historial_clinico_factura_id_facturas", "historial_clinico", "facturas", ["factura_id"], ["id"])

    op.add_column("documentos_paciente", sa.Column("fecha_documento", sa.Date(), nullable=True))
    op.add_column("documentos_paciente", sa.Column("tratamiento_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documentos_paciente", sa.Column("historial_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documentos_paciente", sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documentos_paciente", sa.Column("etiquetas", sa.Text(), nullable=True))
    op.create_foreign_key("fk_documentos_paciente_tratamiento_id", "documentos_paciente", "tratamientos_catalogo", ["tratamiento_id"], ["id"])
    op.create_foreign_key("fk_documentos_paciente_historial_id", "documentos_paciente", "historial_clinico", ["historial_id"], ["id"])
    op.create_foreign_key("fk_documentos_paciente_doctor_id", "documentos_paciente", "doctores", ["doctor_id"], ["id"])

    op.add_column("consentimientos", sa.Column("tratamiento_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("doctor_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("historial_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("documento_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consentimientos", sa.Column("estado", sa.String(length=30), nullable=False, server_default="pendiente_firma"))
    op.add_column("consentimientos", sa.Column("firmado_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("consentimientos", sa.Column("plantilla_version", sa.String(length=30), nullable=True))
    op.add_column("consentimientos", sa.Column("contenido", sa.Text(), nullable=True))
    op.create_index("ix_consentimientos_estado", "consentimientos", ["estado"])
    op.create_foreign_key("fk_consentimientos_tratamiento_id", "consentimientos", "tratamientos_catalogo", ["tratamiento_id"], ["id"])
    op.create_foreign_key("fk_consentimientos_doctor_id", "consentimientos", "doctores", ["doctor_id"], ["id"])
    op.create_foreign_key("fk_consentimientos_historial_id", "consentimientos", "historial_clinico", ["historial_id"], ["id"])
    op.create_foreign_key("fk_consentimientos_documento_id", "consentimientos", "documentos_paciente", ["documento_id"], ["id"])

    op.add_column("trabajos_laboratorio", sa.Column("tratamiento_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("presupuesto_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("factura_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("referencia", sa.String(length=80), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("tipo_trabajo", sa.String(length=50), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("coste_laboratorio", sa.Numeric(10, 2), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("precio_paciente", sa.Numeric(10, 2), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("margen", sa.Numeric(10, 2), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("comision_doctor_pct", sa.Numeric(5, 2), nullable=True))
    op.add_column("trabajos_laboratorio", sa.Column("estado_pago_laboratorio", sa.String(length=20), nullable=False, server_default="pendiente"))
    op.add_column("trabajos_laboratorio", sa.Column("estado_cobro_paciente", sa.String(length=20), nullable=False, server_default="pendiente"))
    op.create_index("ix_trabajos_laboratorio_referencia", "trabajos_laboratorio", ["referencia"])
    op.create_foreign_key("fk_trabajos_laboratorio_tratamiento_id", "trabajos_laboratorio", "tratamientos_catalogo", ["tratamiento_id"], ["id"])
    op.create_foreign_key("fk_trabajos_laboratorio_presupuesto_id", "trabajos_laboratorio", "presupuestos", ["presupuesto_id"], ["id"])
    op.create_foreign_key("fk_trabajos_laboratorio_factura_id", "trabajos_laboratorio", "facturas", ["factura_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_trabajos_laboratorio_factura_id", "trabajos_laboratorio", type_="foreignkey")
    op.drop_constraint("fk_trabajos_laboratorio_presupuesto_id", "trabajos_laboratorio", type_="foreignkey")
    op.drop_constraint("fk_trabajos_laboratorio_tratamiento_id", "trabajos_laboratorio", type_="foreignkey")
    op.drop_index("ix_trabajos_laboratorio_referencia", table_name="trabajos_laboratorio")
    for column in (
        "estado_cobro_paciente", "estado_pago_laboratorio", "comision_doctor_pct",
        "margen", "precio_paciente", "coste_laboratorio", "tipo_trabajo", "referencia",
        "factura_id", "presupuesto_id", "tratamiento_id",
    ):
        op.drop_column("trabajos_laboratorio", column)

    op.drop_constraint("fk_consentimientos_documento_id", "consentimientos", type_="foreignkey")
    op.drop_constraint("fk_consentimientos_historial_id", "consentimientos", type_="foreignkey")
    op.drop_constraint("fk_consentimientos_doctor_id", "consentimientos", type_="foreignkey")
    op.drop_constraint("fk_consentimientos_tratamiento_id", "consentimientos", type_="foreignkey")
    op.drop_index("ix_consentimientos_estado", table_name="consentimientos")
    for column in (
        "contenido", "plantilla_version", "firmado_at", "estado", "documento_id",
        "historial_id", "doctor_id", "tratamiento_id",
    ):
        op.drop_column("consentimientos", column)

    op.drop_constraint("fk_documentos_paciente_doctor_id", "documentos_paciente", type_="foreignkey")
    op.drop_constraint("fk_documentos_paciente_historial_id", "documentos_paciente", type_="foreignkey")
    op.drop_constraint("fk_documentos_paciente_tratamiento_id", "documentos_paciente", type_="foreignkey")
    for column in ("etiquetas", "doctor_id", "historial_id", "tratamiento_id", "fecha_documento"):
        op.drop_column("documentos_paciente", column)

    op.drop_constraint("fk_historial_clinico_factura_id_facturas", "historial_clinico", type_="foreignkey")
    op.drop_index("ix_historial_clinico_factura_id", table_name="historial_clinico")
    op.drop_index("ix_historial_clinico_estado", table_name="historial_clinico")
    for column in ("factura_id", "importe", "estado", "procedimiento", "diagnostico"):
        op.drop_column("historial_clinico", column)

    op.drop_index("ix_citas_telefonear_estado_contacto", table_name="citas_telefonear")
    for column in ("proximo_intento_at", "ultimo_intento_at", "estado_contacto", "notas"):
        op.drop_column("citas_telefonear", column)

    for column in (
        "motivo_cancelacion", "confirmado_at", "recordatorio_at",
        "recordatorio_estado", "recordatorio_canal", "recordatorio_enviado",
    ):
        op.drop_column("citas", column)
