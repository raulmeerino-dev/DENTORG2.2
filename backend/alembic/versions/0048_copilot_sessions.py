"""Encrypted, short-lived copilot state and confirmation receipts.
Revision ID: 0048
Revises: 0047
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade():
    # The table survives application rollback so an upgrade must be repeatable.
    if sa.inspect(op.get_bind()).has_table("copilot_sessions"):
        return
    op.create_table(
        "copilot_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuarios.id"), nullable=False
        ),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinicas.id")),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("state_encrypted", sa.LargeBinary()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_copilot_sessions_user_id", "copilot_sessions", ["user_id"])
    op.create_index("ix_copilot_sessions_expires_at", "copilot_sessions", ["expires_at"])


def downgrade():
    # Preserve confirmation receipts on application rollback.
    pass
