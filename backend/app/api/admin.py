"""
Router de administración — gestión de usuarios, entidades y configuración.
Solo accesible para rol 'admin'.
"""
import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import CurrentUser, RequireAdmin, get_current_user, require_roles
from app.core.security import hash_password
from app.database import get_db
from app.models.entidad import Entidad
from app.models.factura import Factura
from app.models.registro_evento_sif import RegistroEventoSIF
from app.models.registro_facturacion import RegistroFacturacion
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate
from app.services.verifactu_service import registrar_evento_sif
from app.services.verifactu_service import obtener_resumen_cumplimiento_sif

router = APIRouter()
settings = get_settings()


@router.get("/usuarios", response_model=list[UsuarioResponse], dependencies=[RequireAdmin])
async def listar_usuarios(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[UsuarioResponse]:
    """Lista todos los usuarios del sistema."""
    result = await db.execute(select(Usuario).order_by(Usuario.nombre))
    usuarios = result.scalars().all()
    return [UsuarioResponse.model_validate(u) for u in usuarios]


@router.post("/usuarios", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_usuario(
    data: UsuarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UsuarioResponse:
    """Crear nuevo usuario. Solo admin."""
    # Verificar que el username no existe
    result = await db.execute(select(Usuario).where(Usuario.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un usuario con username '{data.username}'",
        )

    usuario = Usuario(
        username=data.username,
        password_hash=hash_password(data.password),
        nombre=data.nombre,
        rol=data.rol,
        doctor_id=data.doctor_id,
        activo=True,
    )
    db.add(usuario)
    await db.commit()
    await db.refresh(usuario)
    return UsuarioResponse.model_validate(usuario)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioResponse, dependencies=[RequireAdmin])
async def actualizar_usuario(
    usuario_id: UUID,
    data: UsuarioUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UsuarioResponse:
    """Actualizar datos de usuario (nombre, rol, activo)."""
    result = await db.execute(select(Usuario).where(Usuario.id == usuario_id))
    usuario = result.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if data.nombre is not None:
        usuario.nombre = data.nombre
    if data.rol is not None:
        usuario.rol = data.rol
    if data.doctor_id is not None:
        usuario.doctor_id = data.doctor_id
    if data.activo is not None:
        usuario.activo = data.activo

    await db.commit()
    await db.refresh(usuario)
    return UsuarioResponse.model_validate(usuario)


# ─── ENTIDADES ────────────────────────────────────────────────────────────────

class EntidadCreate(BaseModel):
    nombre: str
    cif: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    contacto: str | None = None


class EntidadUpdate(BaseModel):
    nombre: str | None = None
    cif: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    contacto: str | None = None
    activo: bool | None = None


class EntidadResponse(BaseModel):
    id: UUID
    nombre: str
    cif: str | None
    direccion: str | None
    telefono: str | None
    contacto: str | None
    activo: bool

    model_config = {"from_attributes": True}


class EstadoRemisionUpdate(BaseModel):
    estado_remision: str = Field(..., pattern=r"^(pendiente|enviada|rechazada|anulacion_pendiente|no_verifactu)$")
    detalle: str | None = Field(None, max_length=500)


@router.get("/entidades", response_model=list[EntidadResponse])
async def listar_entidades(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[EntidadResponse]:
    result = await db.execute(select(Entidad).order_by(Entidad.nombre))
    return [EntidadResponse.model_validate(e) for e in result.scalars().all()]


@router.post("/entidades", response_model=EntidadResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_entidad(
    data: EntidadCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EntidadResponse:
    entidad = Entidad(**data.model_dump())
    db.add(entidad)
    await db.commit()
    await db.refresh(entidad)
    return EntidadResponse.model_validate(entidad)


@router.patch("/entidades/{entidad_id}", response_model=EntidadResponse, dependencies=[RequireAdmin])
async def actualizar_entidad(
    entidad_id: UUID,
    data: EntidadUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EntidadResponse:
    result = await db.execute(select(Entidad).where(Entidad.id == entidad_id))
    entidad = result.scalar_one_or_none()
    if not entidad:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(entidad, field, value)
    await db.commit()
    await db.refresh(entidad)
    return EntidadResponse.model_validate(entidad)


@router.get("/cumplimiento-sif", dependencies=[RequireAdmin])
async def obtener_cumplimiento_sif(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await obtener_resumen_cumplimiento_sif(db)


@router.get("/cumplimiento-sif/declaracion", dependencies=[RequireAdmin])
async def obtener_declaracion_responsable() -> dict:
    return {
        "sif_codigo": settings.sif_codigo,
        "sif_version": settings.sif_version,
        "sif_nombre_producto": settings.sif_nombre_producto,
        "productor": settings.sif_productor_nombre,
        "productor_nif": settings.sif_productor_nif,
        "modo": settings.verifactu_mode,
        "texto": settings.declaracion_responsable_texto,
    }


@router.post("/cumplimiento-sif/registros/{registro_id}/remision", dependencies=[RequireAdmin])
async def actualizar_estado_remision_registro(
    registro_id: UUID,
    data: EstadoRemisionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> dict:
    registro = await db.get(RegistroFacturacion, registro_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Registro de facturacion no encontrado")
    registro.estado_remision = data.estado_remision
    if data.estado_remision == "enviada":
        from datetime import UTC, datetime

        registro.enviado_aeat_at = datetime.now(UTC)

    factura = await db.get(Factura, registro.factura_id)
    if factura:
        factura.estado_verifactu = data.estado_remision
        if data.estado_remision == "enviada":
            factura.enviada_aeat_at = registro.enviado_aeat_at

    await registrar_evento_sif(
        db,
        tipo_evento="REMISION_SIF_ESTADO_MANUAL",
        factura_id=registro.factura_id,
        usuario_id=current_user.user_id,
        detalles={
            "registro_id": str(registro.id),
            "estado_remision": data.estado_remision,
            "detalle": data.detalle,
        },
    )
    await db.commit()
    return {"ok": True, "registro_id": str(registro.id), "estado_remision": registro.estado_remision}


@router.get("/cumplimiento-sif/export", dependencies=[RequireAdmin])
async def exportar_cumplimiento_sif(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    registros = (
        await db.execute(
            select(RegistroFacturacion).order_by(
                RegistroFacturacion.serie,
                RegistroFacturacion.secuencia,
            )
        )
    ).scalars().all()
    eventos = (
        await db.execute(
            select(RegistroEventoSIF).order_by(
                RegistroEventoSIF.created_at,
                RegistroEventoSIF.id,
            )
        )
    ).scalars().all()
    resumen = await obtener_resumen_cumplimiento_sif(db)
    payload = {
        "sistema": {
            "codigo": settings.sif_codigo,
            "version": settings.sif_version,
            "modo": settings.verifactu_mode,
            "declaracion_responsable": settings.declaracion_responsable_texto,
        },
        "resumen": resumen["resumen"],
        "registros_facturacion": [
            {
                "id": str(r.id),
                "factura_id": str(r.factura_id),
                "serie": r.serie,
                "numero_factura": r.numero_factura,
                "tipo_registro": r.tipo_registro,
                "secuencia": r.secuencia,
                "huella_anterior": r.huella_anterior,
                "huella": r.huella,
                "estado_remision": r.estado_remision,
                "payload": r.payload,
                "created_at": r.created_at.isoformat(),
            }
            for r in registros
        ],
        "eventos_sif": [
            {
                "id": str(e.id),
                "factura_id": str(e.factura_id) if e.factura_id else None,
                "tipo_evento": e.tipo_evento,
                "previous_hash": e.previous_hash,
                "event_hash": e.event_hash,
                "detalles": e.detalles,
                "created_at": e.created_at.isoformat(),
            }
            for e in eventos
        ],
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=True, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="cumplimiento_sif.json"'},
    )
