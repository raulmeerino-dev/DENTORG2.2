"""Verifactu: campos huella, num_registro, estado_verifactu en facturas.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS huella VARCHAR(64);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS num_registro INTEGER;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS estado_verifactu VARCHAR(20);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS enviada_aeat_at TIMESTAMPTZ;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS es_rectificativa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS factura_rectificada_id UUID REFERENCES facturas(id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_facturas_huella
    ON facturas (huella)
    WHERE huella IS NOT NULL;
"""

DOWNGRADE_SQL = """
DROP INDEX IF EXISTS ix_facturas_huella;
ALTER TABLE facturas DROP COLUMN IF EXISTS factura_rectificada_id;
ALTER TABLE facturas DROP COLUMN IF EXISTS es_rectificativa;
ALTER TABLE facturas DROP COLUMN IF EXISTS enviada_aeat_at;
ALTER TABLE facturas DROP COLUMN IF EXISTS estado_verifactu;
ALTER TABLE facturas DROP COLUMN IF EXISTS num_registro;
ALTER TABLE facturas DROP COLUMN IF EXISTS huella;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
