"""private prescription templates and provider state

Revision ID: 0045
Revises: 0044
Create Date: 2026-06-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "receta_plantillas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinicas.id"), nullable=True),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("nombre_original", sa.String(length=255), nullable=False),
        sa.Column("nombre_guardado", sa.String(length=255), nullable=False),
        sa.Column("ruta", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column("campos_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("requiere_dni", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("requiere_fecha_nacimiento", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_receta_plantillas_clinica_id", "receta_plantillas", ["clinica_id"])

    op.add_column("recetas_clinicas", sa.Column("plantilla_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("estado", sa.String(length=40), nullable=False, server_default="borrador"))
    op.add_column("recetas_clinicas", sa.Column("provider_mode", sa.String(length=20), nullable=False, server_default="disabled"))
    op.add_column("recetas_clinicas", sa.Column("external_id", sa.String(length=120), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("provider_status", sa.String(length=80), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("provider_error", sa.Text(), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("verification_code", sa.String(length=120), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("pdf_documento_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("pdf_path", sa.String(length=500), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("pdf_hash_sha256", sa.String(length=64), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("emitida_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("enviada_proveedor_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("certificada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("rechazada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("anulada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("dispensada_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("emitida_por_usuario_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("anulada_por_usuario_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("ip_ultima_accion", sa.String(length=80), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("user_agent_ultima_accion", sa.String(length=500), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("motivo_anulacion", sa.Text(), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_nombre", sa.String(length=150), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_num_colegiado", sa.String(length=80), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_colegio", sa.String(length=150), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_provincia", sa.String(length=100), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_especialidad", sa.String(length=120), nullable=True))
    op.add_column("recetas_clinicas", sa.Column("prescriptor_nif", sa.String(length=30), nullable=True))
    op.create_foreign_key("fk_recetas_clinicas_plantilla", "recetas_clinicas", "receta_plantillas", ["plantilla_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_recetas_clinicas_pdf_documento", "recetas_clinicas", "documentos_paciente", ["pdf_documento_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_recetas_clinicas_emitida_usuario", "recetas_clinicas", "usuarios", ["emitida_por_usuario_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_recetas_clinicas_anulada_usuario", "recetas_clinicas", "usuarios", ["anulada_por_usuario_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_recetas_clinicas_plantilla_id", "recetas_clinicas", ["plantilla_id"])
    op.create_index("ix_recetas_clinicas_estado", "recetas_clinicas", ["estado"])
    op.create_index("ix_recetas_clinicas_external_id", "recetas_clinicas", ["external_id"])


def downgrade() -> None:
    op.drop_index("ix_recetas_clinicas_external_id", table_name="recetas_clinicas")
    op.drop_index("ix_recetas_clinicas_estado", table_name="recetas_clinicas")
    op.drop_index("ix_recetas_clinicas_plantilla_id", table_name="recetas_clinicas")
    op.drop_constraint("fk_recetas_clinicas_anulada_usuario", "recetas_clinicas", type_="foreignkey")
    op.drop_constraint("fk_recetas_clinicas_emitida_usuario", "recetas_clinicas", type_="foreignkey")
    op.drop_constraint("fk_recetas_clinicas_pdf_documento", "recetas_clinicas", type_="foreignkey")
    op.drop_constraint("fk_recetas_clinicas_plantilla", "recetas_clinicas", type_="foreignkey")
    for column in [
        "prescriptor_nif", "prescriptor_especialidad", "prescriptor_provincia",
        "prescriptor_colegio", "prescriptor_num_colegiado", "prescriptor_nombre",
        "motivo_anulacion", "user_agent_ultima_accion", "ip_ultima_accion",
        "anulada_por_usuario_id", "emitida_por_usuario_id", "dispensada_at",
        "anulada_at", "rechazada_at", "certificada_at", "enviada_proveedor_at",
        "emitida_at", "pdf_hash_sha256", "pdf_path", "pdf_documento_id",
        "verification_code", "provider_error", "provider_status", "external_id",
        "provider_mode", "estado", "plantilla_id",
    ]:
        op.drop_column("recetas_clinicas", column)
    op.drop_index("ix_receta_plantillas_clinica_id", table_name="receta_plantillas")
    op.drop_table("receta_plantillas")
