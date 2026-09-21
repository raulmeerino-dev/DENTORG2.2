"""Record arrival, clinical attention and reception checkout for Jornada.

Revision ID: 0046
Revises: 0045
"""

from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'en_atencion'")
    for name in ("llegada_at", "atencion_iniciada_at", "finalizada_at", "salida_resuelta_at"):
        op.execute(f"ALTER TABLE citas ADD COLUMN IF NOT EXISTS {name} TIMESTAMPTZ")
    op.execute("ALTER TABLE citas ADD COLUMN IF NOT EXISTS solape_urgencia BOOLEAN NOT NULL DEFAULT false")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_citas_pendiente_salida ON citas (clinica_id, finalizada_at) "
        "WHERE salida_resuelta_at IS NULL AND finalizada_at IS NOT NULL"
    )


def downgrade() -> None:
    # An application rollback must not erase visit timestamps or urgency data.
    # Keep additive columns and enum label; old SQLAlchemy models ignore them.
    # Archive the active clinical state before translating it for old clients.
    op.execute("""
        INSERT INTO cita_cambios
            (id, cita_id, accion, estado_anterior, estado_nuevo, motivo, datos, created_at)
        SELECT gen_random_uuid(), id, 'jornada_rollback', 'en_atencion', 'en_clinica',
            'Compatibilidad de rollback; tiempos clínicos conservados',
            jsonb_build_object('antes', to_jsonb(citas)), now()
        FROM citas WHERE estado::text = 'en_atencion'
    """
    )
    op.execute("UPDATE citas SET estado = 'en_clinica' WHERE estado::text = 'en_atencion'")
