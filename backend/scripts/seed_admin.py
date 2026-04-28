"""
Script para crear el primer usuario admin.
Ejecutar una sola vez tras levantar la BD:

    cd backend
    python scripts/seed_admin.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models.usuario import Usuario
from sqlalchemy import select


async def crear_admin():
    username = input("Username para el admin [admin]: ").strip() or "admin"
    password = input("Contraseña (mín. 8 chars): ").strip()
    nombre = input("Nombre mostrado [Administrador]: ").strip() or "Administrador"

    if len(password) < 8:
        print("ERROR: La contraseña debe tener al menos 8 caracteres.")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Usuario).where(Usuario.username == username))
        if result.scalar_one_or_none():
            print(f"ERROR: Ya existe un usuario con username '{username}'.")
            return

        usuario = Usuario(
            username=username,
            password_hash=hash_password(password),
            nombre=nombre,
            rol="admin",
            activo=True,
        )
        session.add(usuario)
        await session.commit()
        print(f"OK: Usuario admin '{username}' creado correctamente.")


if __name__ == "__main__":
    asyncio.run(crear_admin())
