"""add doctor notifications

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-23
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "doctor_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("recipient_doctor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["appointment_id"], ["citas.id"]),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["pacientes.id"]),
        sa.ForeignKeyConstraint(["recipient_doctor_id"], ["doctores.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("recipient_doctor_id", "appointment_id", "type", name="uq_doctor_notifications_recipient_appointment_type"),
    )
    op.create_index("ix_doctor_notifications_appointment_id", "doctor_notifications", ["appointment_id"])
    op.create_index("ix_doctor_notifications_clinica_id", "doctor_notifications", ["clinica_id"])
    op.create_index("ix_doctor_notifications_patient_id", "doctor_notifications", ["patient_id"])
    op.create_index("ix_doctor_notifications_read", "doctor_notifications", ["read"])
    op.create_index("ix_doctor_notifications_recipient_doctor_id", "doctor_notifications", ["recipient_doctor_id"])
    op.create_index("ix_doctor_notifications_type", "doctor_notifications", ["type"])


def downgrade() -> None:
    op.drop_index("ix_doctor_notifications_type", table_name="doctor_notifications")
    op.drop_index("ix_doctor_notifications_recipient_doctor_id", table_name="doctor_notifications")
    op.drop_index("ix_doctor_notifications_read", table_name="doctor_notifications")
    op.drop_index("ix_doctor_notifications_patient_id", table_name="doctor_notifications")
    op.drop_index("ix_doctor_notifications_clinica_id", table_name="doctor_notifications")
    op.drop_index("ix_doctor_notifications_appointment_id", table_name="doctor_notifications")
    op.drop_table("doctor_notifications")
