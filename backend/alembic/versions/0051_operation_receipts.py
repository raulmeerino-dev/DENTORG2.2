"""Atomic encrypted receipts for retryable mutations.

Revision ID: 0051
Revises: 0050
"""
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE operation_receipts (
            owner_id uuid NOT NULL, key varchar(128) NOT NULL,
            fingerprint varchar(64) NOT NULL, response_encrypted bytea NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id, key)
        )
    """)


def downgrade():
    op.drop_table("operation_receipts")
