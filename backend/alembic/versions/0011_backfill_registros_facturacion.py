"""Rellena registros append-only desde facturas ya selladas.

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-14
"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT
                id,
                serie,
                numero,
                fecha,
                total,
                estado,
                huella,
                num_registro,
                es_rectificativa,
                factura_rectificada_id,
                created_at
            FROM facturas
            WHERE huella IS NOT NULL
            ORDER BY serie, num_registro, created_at
            """
        )
    ).mappings().all()

    previous_by_serie: dict[str, str | None] = {}
    next_seq_by_serie: dict[str, int] = {}

    for row in rows:
        exists = connection.execute(
            sa.text(
                """
                SELECT 1
                FROM registros_facturacion
                WHERE factura_id = :factura_id
                  AND tipo_registro = 'alta'
                LIMIT 1
                """
            ),
            {"factura_id": row["id"]},
        ).first()
        if exists:
            previous_by_serie[row["serie"]] = row["huella"]
            continue

        serie = row["serie"]
        secuencia = row["num_registro"] or next_seq_by_serie.get(serie, 1)
        next_seq_by_serie[serie] = secuencia + 1
        huella_anterior = previous_by_serie.get(serie)
        payload = {
            "tipo_registro": "alta",
            "nif_emisor": "B00000000",
            "serie": serie,
            "numero": row["numero"],
            "fecha": row["fecha"].isoformat() if row["fecha"] else None,
            "total": f"{row['total']:.2f}" if row["total"] is not None else "0.00",
            "factura_id": str(row["id"]),
            "factura_rectificada_id": str(row["factura_rectificada_id"]) if row["factura_rectificada_id"] else None,
            "es_rectificativa": bool(row["es_rectificativa"]),
            "estado_factura": row["estado"],
            "huella_anterior": huella_anterior or ("0" * 64),
            "sistema_codigo": "EURODENT2-COPY",
            "sistema_version": "0.2.0",
            "usuario_id": None,
            "detalles": {},
        }

        connection.execute(
            sa.text(
                """
                INSERT INTO registros_facturacion (
                    id,
                    factura_id,
                    serie,
                    numero_factura,
                    tipo_registro,
                    secuencia,
                    huella_anterior,
                    huella,
                    estado_remision,
                    enviado_aeat_at,
                    payload,
                    created_at,
                    updated_at
                )
                VALUES (
                    uuid_generate_v4(),
                    :factura_id,
                    :serie,
                    :numero_factura,
                    'alta',
                    :secuencia,
                    :huella_anterior,
                    :huella,
                    'no_verifactu',
                    NULL,
                    CAST(:payload AS JSONB),
                    :created_at,
                    NULL
                )
                """
            ),
            {
                "factura_id": row["id"],
                "serie": serie,
                "numero_factura": row["numero"],
                "secuencia": secuencia,
                "huella_anterior": huella_anterior,
                "huella": row["huella"],
                "payload": json.dumps(payload, ensure_ascii=True),
                "created_at": row["created_at"],
            },
        )
        previous_by_serie[serie] = row["huella"]


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text("DELETE FROM registros_facturacion WHERE tipo_registro = 'alta'")
    )
