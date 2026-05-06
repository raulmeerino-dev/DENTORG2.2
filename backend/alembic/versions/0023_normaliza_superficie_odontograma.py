"""normaliza superficie odontograma

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-05
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE odontograma_superficies
        SET superficie = 'lingual_palatina'
        WHERE superficie = 'lingual_palatal'
        """
    )
    op.execute(
        """
        UPDATE odontograma_eventos
        SET superficie = 'lingual_palatina'
        WHERE superficie = 'lingual_palatal'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE odontograma_superficies
        SET superficie = 'lingual_palatal'
        WHERE superficie = 'lingual_palatina'
        """
    )
    op.execute(
        """
        UPDATE odontograma_eventos
        SET superficie = 'lingual_palatal'
        WHERE superficie = 'lingual_palatina'
        """
    )
