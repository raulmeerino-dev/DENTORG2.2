"""Optional habitual treatment duration for appointment suggestions.

Revision ID: 0047
Revises: 0046
"""

from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE tratamientos_catalogo ADD COLUMN IF NOT EXISTS duracion_habitual_min SMALLINT"
    )


def downgrade() -> None:
    # Preserve configuration on an application rollback. Older models ignore
    # this nullable additive column and upgrade is safe to reapply.
    pass
