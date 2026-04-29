"""
Sincroniza el catalogo de tratamientos con la tarifa base de la clinica.

Ejecutar desde backend/:
    .venv/Scripts/python scripts/seed_tratamientos.py
"""

import asyncio
import io
import os
import sys

from sqlalchemy import select

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.data.tratamientos_base import FAMILIAS_TRATAMIENTO_BASE, TRATAMIENTOS_BASE  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo  # noqa: E402


def normalizar(texto: str) -> str:
    return " ".join(texto.casefold().strip().split())


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        familia_map = {}

        for fam_data in FAMILIAS_TRATAMIENTO_BASE:
            existing = (
                await db.execute(
                    select(FamiliaTratamiento).where(FamiliaTratamiento.nombre == fam_data["nombre"])
                )
            ).scalar_one_or_none()

            if existing:
                existing.icono = fam_data["icono"]
                existing.orden = fam_data["orden"]
                existing.activo = True
                familia_map[fam_data["nombre"]] = existing
            else:
                fam = FamiliaTratamiento(
                    nombre=fam_data["nombre"],
                    icono=fam_data["icono"],
                    orden=fam_data["orden"],
                    activo=True,
                )
                db.add(fam)
                await db.flush()
                familia_map[fam_data["nombre"]] = fam
                print(f"  Nueva familia: {fam_data['nombre']}")

        tratamientos_actuales = (await db.execute(select(TratamientoCatalogo))).scalars().all()
        por_codigo = {t.codigo: t for t in tratamientos_actuales if t.codigo}
        por_nombre = {normalizar(t.nombre): t for t in tratamientos_actuales}

        codigos_base = set()
        nuevos = 0
        actualizados = 0

        for codigo, nombre, familia_nombre, precio, requiere_pieza, requiere_caras in TRATAMIENTOS_BASE:
            codigos_base.add(codigo)
            familia = familia_map[familia_nombre]
            tratamiento = por_codigo.get(codigo) or por_nombre.get(normalizar(nombre))

            if tratamiento:
                tratamiento.codigo = codigo
                tratamiento.nombre = nombre
                tratamiento.precio = precio
                tratamiento.iva_porcentaje = 0
                tratamiento.requiere_pieza = requiere_pieza
                tratamiento.requiere_caras = requiere_caras
                tratamiento.familia_id = familia.id
                tratamiento.activo = True
                actualizados += 1
            else:
                db.add(
                    TratamientoCatalogo(
                        familia_id=familia.id,
                        codigo=codigo,
                        nombre=nombre,
                        precio=precio,
                        iva_porcentaje=0,
                        requiere_pieza=requiere_pieza,
                        requiere_caras=requiere_caras,
                        activo=True,
                    )
                )
                nuevos += 1

        desactivados = 0
        for tratamiento in tratamientos_actuales:
            if tratamiento.codigo not in codigos_base and tratamiento.activo:
                tratamiento.activo = False
                desactivados += 1

        await db.commit()
        print(
            "\nCatalogo actualizado: "
            f"{len(FAMILIAS_TRATAMIENTO_BASE)} familias, "
            f"{nuevos} nuevos, {actualizados} actualizados, {desactivados} desactivados."
        )


if __name__ == "__main__":
    asyncio.run(seed())
