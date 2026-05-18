"""laboratorio numero_orden via sequence

Revision ID: 0029
Revises: 0028
Create Date: 2026-05-19

Sustituye el calculo manual `max + 1` (race-prone) por una sequence
PostgreSQL que asigna el numero_orden atomicamente en cada INSERT.

La numeración pasa de per-clinica a global. Coherente con cómo trabaja la
clinica unica (que es la instalacion típica). En despliegues multi-clinica
podría reformularse, pero por ahora se prefiere robustez frente a races
sobre granularidad por clinica.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS trabajos_lab_numero_orden_seq")
    op.execute(
        "SELECT setval('trabajos_lab_numero_orden_seq', "
        "COALESCE((SELECT MAX(numero_orden) FROM trabajos_laboratorio), 0) + 1, false)"
    )
    op.execute(
        "ALTER TABLE trabajos_laboratorio "
        "ALTER COLUMN numero_orden SET DEFAULT nextval('trabajos_lab_numero_orden_seq')"
    )
    op.execute(
        "ALTER SEQUENCE trabajos_lab_numero_orden_seq OWNED BY trabajos_laboratorio.numero_orden"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE trabajos_laboratorio ALTER COLUMN numero_orden DROP DEFAULT"
    )
    op.execute("DROP SEQUENCE IF EXISTS trabajos_lab_numero_orden_seq")
