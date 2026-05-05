"""inventario avanzado con proveedores y pedidos

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("proveedores", sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("proveedores", sa.Column("contacto", sa.String(length=150), nullable=True))
    op.add_column("proveedores", sa.Column("notas", sa.Text(), nullable=True))
    op.create_index("ix_proveedores_clinica_id", "proveedores", ["clinica_id"])
    op.create_foreign_key("fk_proveedores_clinica_id", "proveedores", "clinicas", ["clinica_id"], ["id"])

    op.add_column("productos", sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("productos", sa.Column("categoria", sa.String(length=80), nullable=True))
    op.add_column("productos", sa.Column("sku", sa.String(length=80), nullable=True))
    op.add_column("productos", sa.Column("unidad", sa.String(length=30), server_default="ud", nullable=False))
    op.add_column(
        "productos",
        sa.Column("coste_unitario", sa.Numeric(10, 2), server_default="0", nullable=False),
    )
    op.create_index("ix_productos_clinica_id", "productos", ["clinica_id"])
    op.create_index("ix_productos_sku", "productos", ["sku"])
    op.create_foreign_key("fk_productos_clinica_id", "productos", "clinicas", ["clinica_id"], ["id"])

    op.add_column("movimientos_inventario", sa.Column("referencia_tipo", sa.String(length=50), nullable=True))
    op.add_column("movimientos_inventario", sa.Column("referencia_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_movimientos_inventario_referencia_id", "movimientos_inventario", ["referencia_id"])

    op.create_table(
        "pedidos_proveedor",
        sa.Column("proveedor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("clinica_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("estado", sa.String(length=30), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.ForeignKeyConstraint(["clinica_id"], ["clinicas.id"]),
        sa.ForeignKeyConstraint(["proveedor_id"], ["proveedores.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pedidos_proveedor_clinica_id", "pedidos_proveedor", ["clinica_id"])
    op.create_index("ix_pedidos_proveedor_estado", "pedidos_proveedor", ["estado"])
    op.create_index("ix_pedidos_proveedor_proveedor_id", "pedidos_proveedor", ["proveedor_id"])

    op.create_table(
        "pedido_lineas",
        sa.Column("pedido_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("coste_unitario", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos_proveedor.id"]),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pedido_lineas_pedido_id", "pedido_lineas", ["pedido_id"])
    op.create_index("ix_pedido_lineas_producto_id", "pedido_lineas", ["producto_id"])


def downgrade() -> None:
    op.drop_index("ix_pedido_lineas_producto_id", table_name="pedido_lineas")
    op.drop_index("ix_pedido_lineas_pedido_id", table_name="pedido_lineas")
    op.drop_table("pedido_lineas")

    op.drop_index("ix_pedidos_proveedor_proveedor_id", table_name="pedidos_proveedor")
    op.drop_index("ix_pedidos_proveedor_estado", table_name="pedidos_proveedor")
    op.drop_index("ix_pedidos_proveedor_clinica_id", table_name="pedidos_proveedor")
    op.drop_table("pedidos_proveedor")

    op.drop_index("ix_movimientos_inventario_referencia_id", table_name="movimientos_inventario")
    op.drop_column("movimientos_inventario", "referencia_id")
    op.drop_column("movimientos_inventario", "referencia_tipo")

    op.drop_constraint("fk_productos_clinica_id", "productos", type_="foreignkey")
    op.drop_index("ix_productos_sku", table_name="productos")
    op.drop_index("ix_productos_clinica_id", table_name="productos")
    op.drop_column("productos", "coste_unitario")
    op.drop_column("productos", "unidad")
    op.drop_column("productos", "sku")
    op.drop_column("productos", "categoria")
    op.drop_column("productos", "clinica_id")

    op.drop_constraint("fk_proveedores_clinica_id", "proveedores", type_="foreignkey")
    op.drop_index("ix_proveedores_clinica_id", table_name="proveedores")
    op.drop_column("proveedores", "notas")
    op.drop_column("proveedores", "contacto")
    op.drop_column("proveedores", "clinica_id")
