"""whatsapp bidireccional - comunicaciones y estados de cita

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-17
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NEW_ESTADOS_CITA = (
    "pending_confirmation",
    "confirmed",
    "reminder_sent",
    "reschedule_requested",
    "cancelled_by_patient",
    "pending_manual_review",
    "rescheduled",
)


def upgrade() -> None:
    for estado in NEW_ESTADOS_CITA:
        op.execute(f"ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS '{estado}'")

    op.create_table(
        "whatsapp_comunicaciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("interpreted_intent", sa.String(length=40), nullable=True),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("provider_message_id", sa.String(length=120), nullable=True),
        sa.Column("idempotency_key", sa.String(length=160), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_whatsapp_comunicaciones_direction"),
        sa.ForeignKeyConstraint(["appointment_id"], ["citas.id"]),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["pacientes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_comunicaciones_appointment_id", "whatsapp_comunicaciones", ["appointment_id"])
    op.create_index("ix_whatsapp_comunicaciones_clinica_id", "whatsapp_comunicaciones", ["clinica_id"])
    op.create_index("ix_whatsapp_comunicaciones_created_at", "whatsapp_comunicaciones", ["created_at"])
    op.create_index("ix_whatsapp_comunicaciones_direction", "whatsapp_comunicaciones", ["direction"])
    op.create_index("ix_whatsapp_comunicaciones_intent", "whatsapp_comunicaciones", ["interpreted_intent"])
    op.create_index("ix_whatsapp_comunicaciones_patient_id", "whatsapp_comunicaciones", ["patient_id"])
    op.create_index("ix_whatsapp_comunicaciones_phone", "whatsapp_comunicaciones", ["phone"])
    op.create_index("ix_whatsapp_comunicaciones_processed", "whatsapp_comunicaciones", ["processed"])
    op.create_index("ix_whatsapp_comunicaciones_provider_message_id", "whatsapp_comunicaciones", ["provider_message_id"])
    op.create_index(
        "uq_whatsapp_comunicaciones_idempotency_key",
        "whatsapp_comunicaciones",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_whatsapp_comunicaciones_idempotency_key", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_provider_message_id", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_processed", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_phone", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_patient_id", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_intent", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_direction", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_created_at", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_clinica_id", table_name="whatsapp_comunicaciones")
    op.drop_index("ix_whatsapp_comunicaciones_appointment_id", table_name="whatsapp_comunicaciones")
    op.drop_table("whatsapp_comunicaciones")
    # PostgreSQL no permite eliminar valores concretos de un ENUM de forma segura sin recrear el tipo.
