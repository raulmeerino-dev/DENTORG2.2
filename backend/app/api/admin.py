"""
Router de administración — gestión de usuarios, entidades y configuración.
Solo accesible para rol 'admin'.
"""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import (
    ROLE_ADMIN,
    ROLE_RECEPCION,
    CurrentUser,
    RequireAdmin,
    ensure_clinic_access,
)
from app.core.security import hash_password
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.backup import BackupRegistro
from app.models.entidad import Entidad
from app.models.factura import Factura
from app.models.paciente import Paciente
from app.models.portal_invitation import PortalInvitation
from app.models.registro_evento_sif import RegistroEventoSIF
from app.models.registro_facturacion import RegistroFacturacion
from app.models.usuario import Usuario
from app.schemas.extras import BackupRegistroResponse
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, UsuarioUpdate
from app.services.audit import write_audit_log
from app.services.backup_service import (
    BACKUP_DIR,
    crear_backup_cifrado,
    registrar_prueba_restauracion_backup,
    simular_restauracion_backup,
    verificar_backup_archivo,
)
from app.services.portal_invitation_service import generate_portal_token, hash_portal_token
from app.services.production_readiness import build_production_readiness_report
from app.services.verifactu_service import obtener_resumen_cumplimiento_sif, registrar_evento_sif

router = APIRouter()
settings = get_settings()


class BackupCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alcance: str = Field("full", pattern=r"^(database|uploads|full)$")
    retention_days: int | None = Field(None, ge=1, le=3650)


class BackupRestoreProofRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resultado: str = Field(..., pattern=r"^(ok|fallido)$")
    notas: str | None = Field(None, min_length=3, max_length=2000)


class PortalInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente_id: UUID
    expires_in_hours: int = Field(168, ge=1, le=720)
    proposito: str = Field("portal_access", pattern=r"^(portal_access|documentos|consentimientos|citas)$")
    uso_unico: bool = False
    nota: str | None = Field(None, max_length=500)


class PortalInvitationResponse(BaseModel):
    id: UUID
    paciente_id: UUID
    clinica_id: UUID | None
    proposito: str
    estado: str
    expires_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    token: str | None = None
    invite_url: str | None = None

    model_config = {"from_attributes": True}


async def _validate_patient_user_link(
    db: AsyncSession,
    paciente_id: UUID | None,
    clinica_id: UUID | None,
) -> None:
    if paciente_id is None:
        return
    paciente = await db.get(Paciente, paciente_id)
    if not paciente or getattr(paciente, "deleted_at", None) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paciente vinculado no encontrado")
    if clinica_id and paciente.clinica_id and paciente.clinica_id != clinica_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El paciente vinculado pertenece a otra clinica.",
        )


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
    await _validate_patient_user_link(db, data.paciente_id, data.clinica_id)
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
        paciente_id=data.paciente_id,
        clinica_id=data.clinica_id,
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

    effective_paciente_id = data.paciente_id if data.paciente_id is not None else usuario.paciente_id
    effective_clinica_id = data.clinica_id if data.clinica_id is not None else usuario.clinica_id
    await _validate_patient_user_link(db, effective_paciente_id, effective_clinica_id)

    if data.nombre is not None:
        usuario.nombre = data.nombre
    if data.rol is not None:
        usuario.rol = data.rol
    if data.doctor_id is not None:
        usuario.doctor_id = data.doctor_id
    if data.paciente_id is not None:
        usuario.paciente_id = data.paciente_id
    if data.clinica_id is not None:
        usuario.clinica_id = data.clinica_id
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


class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    user_id: UUID | None
    clinica_id: UUID | None
    action: str
    entity_type: str
    entity_id: UUID | None
    old_values: dict | None
    new_values: dict | None
    ip_address: str | None
    user_agent: str | None
    event_hash: str | None


@router.get("/auditoria", response_model=list[AuditLogResponse], dependencies=[RequireAdmin])
async def listar_auditoria(
    db: Annotated[AsyncSession, Depends(get_db)],
    desde: datetime | None = Query(None),
    hasta: datetime | None = Query(None),
    usuario: UUID | None = Query(None),
    accion: str | None = Query(None),
    entidad: str | None = Query(None),
    clinica_id: UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[AuditLogResponse]:
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    if desde:
        stmt = stmt.where(AuditLog.timestamp >= desde)
    if hasta:
        stmt = stmt.where(AuditLog.timestamp <= hasta)
    if usuario:
        stmt = stmt.where(AuditLog.usuario_id == usuario)
    if accion:
        stmt = stmt.where(AuditLog.accion.ilike(f"%{accion}%"))
    if entidad:
        stmt = stmt.where(AuditLog.tabla.ilike(f"%{entidad}%"))
    if clinica_id:
        stmt = stmt.where(AuditLog.clinica_id == clinica_id)

    result = await db.execute(stmt)
    return [
        AuditLogResponse(
            id=item.id,
            timestamp=item.timestamp,
            user_id=item.usuario_id,
            clinica_id=item.clinica_id,
            action=item.accion,
            entity_type=item.tabla,
            entity_id=item.registro_id,
            old_values=item.datos_antes,
            new_values=item.datos_despues,
            ip_address=item.ip,
            user_agent=item.user_agent,
            event_hash=item.event_hash,
        )
        for item in result.scalars().all()
    ]


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


@router.get("/backups", response_model=list[BackupRegistroResponse], dependencies=[RequireAdmin])
async def listar_backups(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BackupRegistroResponse]:
    result = await db.execute(select(BackupRegistro).order_by(BackupRegistro.started_at.desc()).limit(50))
    return [BackupRegistroResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/backups", response_model=BackupRegistroResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_backup(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
    data: BackupCreateRequest | None = None,
) -> BackupRegistroResponse:
    payload = data or BackupCreateRequest()
    registro = await crear_backup_cifrado(
        db,
        created_by_id=current_user.user_id,
        alcance=payload.alcance,
        retention_days=payload.retention_days,
    )
    await write_audit_log(
        db,
        user=current_user,
        action="BACKUP_CREAR",
        entity_type="backup_registros",
        entity_id=registro.id,
        new_values={
            "estado": registro.estado,
            "alcance": registro.alcance,
            "cifrado": registro.cifrado,
            "incluye_bd": registro.incluye_bd,
            "incluye_uploads": registro.incluye_uploads,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(registro)
    return BackupRegistroResponse.model_validate(registro)


@router.get("/backups/{backup_id}/verificar", dependencies=[RequireAdmin])
async def verificar_backup(
    backup_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> dict:
    registro = await db.get(BackupRegistro, backup_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    resultado = verificar_backup_archivo(registro)
    if resultado.get("ok"):
        registro.verificado_por_id = current_user.user_id
    await write_audit_log(
        db,
        user=current_user,
        action="BACKUP_VERIFICAR" if resultado.get("ok") else "BACKUP_VERIFICAR_FALLO",
        entity_type="backup_registros",
        entity_id=registro.id,
        new_values={k: v for k, v in resultado.items() if k != "filas_por_tabla"},
        request=request,
    )
    await db.commit()
    return resultado


@router.get("/backups/{backup_id}/descargar", dependencies=[RequireAdmin])
async def descargar_backup(
    backup_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> FileResponse:
    registro = await db.get(BackupRegistro, backup_id)
    if not registro or not registro.ruta:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    path = Path(registro.ruta)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo de backup no encontrado")
    await write_audit_log(
        db,
        user=current_user,
        action="BACKUP_DESCARGAR",
        entity_type="backup_registros",
        entity_id=registro.id,
        new_values={"alcance": registro.alcance, "tamano_bytes": registro.tamano_bytes},
        request=request,
    )
    await db.commit()
    return FileResponse(
        path=str(path),
        media_type="application/octet-stream",
        filename=f"dentcore-backup-{registro.id}.dentcorebak",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/backups/{backup_id}/simular-restauracion", dependencies=[RequireAdmin])
async def simular_restauracion(
    backup_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> dict:
    registro = await db.get(BackupRegistro, backup_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    resultado = simular_restauracion_backup(registro)
    await write_audit_log(
        db,
        user=current_user,
        action="BACKUP_SIMULAR_RESTAURACION" if resultado.get("ok") else "BACKUP_SIMULAR_RESTAURACION_FALLO",
        entity_type="backup_registros",
        entity_id=registro.id,
        new_values={k: v for k, v in resultado.items() if k != "filas_por_tabla"},
        request=request,
    )
    await db.commit()
    return resultado


@router.post("/backups/{backup_id}/registrar-prueba-restauracion", response_model=BackupRegistroResponse, dependencies=[RequireAdmin])
async def registrar_prueba_restauracion(
    backup_id: UUID,
    data: BackupRestoreProofRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> BackupRegistroResponse:
    registro = await db.get(BackupRegistro, backup_id)
    if not registro:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    registrar_prueba_restauracion_backup(
        registro,
        usuario_id=current_user.user_id,
        resultado=data.resultado,
        notas=data.notas,
    )
    await write_audit_log(
        db,
        user=current_user,
        action="BACKUP_RESTAURACION_PROBADA" if data.resultado == "ok" else "BACKUP_RESTAURACION_FALLIDA",
        entity_type="backup_registros",
        entity_id=registro.id,
        new_values={"resultado": data.resultado, "notas": data.notas},
        request=request,
    )
    await db.commit()
    await db.refresh(registro)
    return BackupRegistroResponse.model_validate(registro)


@router.post("/portal-invitations", response_model=PortalInvitationResponse, status_code=201)
async def crear_portal_invitation(
    data: PortalInvitationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> PortalInvitationResponse:
    if current_user.rol not in {ROLE_ADMIN, ROLE_RECEPCION}:
        raise HTTPException(status_code=403, detail="Solo admin o recepcion pueden crear invitaciones de portal.")
    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente or getattr(paciente, "deleted_at", None) is not None or paciente.activo is False:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    token = generate_portal_token()
    invitation = PortalInvitation(
        paciente_id=paciente.id,
        clinica_id=paciente.clinica_id,
        token_hash=hash_portal_token(token),
        proposito=data.proposito,
        expires_at=datetime.now(UTC) + timedelta(hours=data.expires_in_hours),
        uso_unico=data.uso_unico,
        created_by_id=current_user.user_id,
        nota=data.nota,
    )
    db.add(invitation)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="PORTAL_INVITATION_CREAR",
        entity_type="portal_invitations",
        entity_id=invitation.id,
        new_values={
            "paciente_id": str(paciente.id),
            "proposito": invitation.proposito,
            "expires_at": invitation.expires_at.isoformat(),
            "uso_unico": invitation.uso_unico,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(invitation)
    invite_url = f"{settings.frontend_url.rstrip('/')}/portal/invite/{token}"
    return PortalInvitationResponse.model_validate(invitation).model_copy(
        update={"token": token, "invite_url": invite_url}
    )


@router.post("/portal-invitations/{invitation_id}/revocar", response_model=PortalInvitationResponse)
async def revocar_portal_invitation(
    invitation_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> PortalInvitationResponse:
    if current_user.rol not in {ROLE_ADMIN, ROLE_RECEPCION}:
        raise HTTPException(status_code=403, detail="Solo admin o recepcion pueden revocar invitaciones.")
    invitation = await db.get(PortalInvitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitacion no encontrada")
    ensure_clinic_access(current_user, invitation.clinica_id)
    invitation.estado = "revocada"
    invitation.revoked_at = datetime.now(UTC)
    invitation.revoked_by_id = current_user.user_id
    await write_audit_log(
        db,
        user=current_user,
        action="PORTAL_INVITATION_REVOCAR",
        entity_type="portal_invitations",
        entity_id=invitation.id,
        new_values={"paciente_id": str(invitation.paciente_id), "revoked_at": invitation.revoked_at.isoformat()},
        clinica_id=invitation.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(invitation)
    return PortalInvitationResponse.model_validate(invitation)


@router.get("/produccion/preflight", dependencies=[RequireAdmin])
async def obtener_preflight_produccion(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    audit_events = await db.scalar(select(func.count()).select_from(AuditLog)) or 0
    rf_count = await db.scalar(select(func.count()).select_from(RegistroFacturacion)) or 0
    sif_event_count = await db.scalar(select(func.count()).select_from(RegistroEventoSIF)) or 0
    patient_portal_users = await db.scalar(
        select(func.count()).select_from(Usuario).where(Usuario.rol == "paciente")
    ) or 0
    patient_portal_unlinked_users = await db.scalar(
        select(func.count()).select_from(Usuario).where(
            Usuario.rol == "paciente",
            Usuario.paciente_id.is_(None),
        )
    ) or 0
    admin_users = await db.scalar(select(func.count()).select_from(Usuario).where(Usuario.rol == "admin")) or 0
    admin_without_2fa = await db.scalar(
        select(func.count()).select_from(Usuario).where(
            Usuario.rol == "admin",
            Usuario.two_factor_secret.is_(None),
        )
    ) or 0
    active_portal_invitations = await db.scalar(
        select(func.count()).select_from(PortalInvitation).where(
            PortalInvitation.estado == "activa",
            PortalInvitation.expires_at > datetime.now(UTC),
            PortalInvitation.revoked_at.is_(None),
        )
    ) or 0
    ultimo_backup = (
        await db.execute(
            select(BackupRegistro).order_by(BackupRegistro.started_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    backup_restore_test = simular_restauracion_backup(ultimo_backup) if ultimo_backup else None

    return build_production_readiness_report(
        settings,
        audit_events=audit_events,
        rf_count=rf_count,
        sif_event_count=sif_event_count,
        patient_portal_users=patient_portal_users,
        patient_portal_unlinked_users=patient_portal_unlinked_users,
        admin_users=admin_users,
        admin_without_2fa=admin_without_2fa,
        backup_restore_test=backup_restore_test,
        backup_directory=str(BACKUP_DIR),
        active_portal_invitations=active_portal_invitations,
        last_backup={
            "estado": ultimo_backup.estado,
            "started_at": ultimo_backup.started_at,
            "cifrado": ultimo_backup.cifrado,
            "hash_sha256": ultimo_backup.hash_sha256,
            "incluye_bd": ultimo_backup.incluye_bd,
            "incluye_uploads": ultimo_backup.incluye_uploads,
            "destino_externo": ultimo_backup.destino_externo,
            "retention_days": ultimo_backup.retention_days,
            "retention_expires_at": ultimo_backup.retention_expires_at,
            "restauracion_resultado": ultimo_backup.restauracion_resultado,
            "restauracion_probada_at": ultimo_backup.restauracion_probada_at,
        }
        if ultimo_backup
        else None,
    )
