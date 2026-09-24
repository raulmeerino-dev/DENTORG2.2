"""Application use cases: tenant checks, orchestration and existing transactions."""
import hashlib
import uuid
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit_log import write_audit_log
from app.core.permissions import (
    BILLING_ROLES,
    ROLE_ADMIN,
    ROLE_DOCTOR,
    ROLE_PACIENTE,
    ROLE_RECEPCION,
    TokenData,
    can_view_health_data,
    ensure_clinic_access,
)
from app.domains.clinical.application.consentimientos import (
    _firma_png_bytes,
    _generar_pdf_consentimiento,
    firmar_consentimiento,
)
from app.domains.clinical.application.consentimientos import (
    _ruta_paciente as _ruta_consentimiento_paciente,
)
from app.domains.clinical.application.documentos import UPLOAD_ROOT, _doc_to_dict
from app.domains.clinical.domain.document_access import (
    ADMIN_DOCUMENT_TYPES,
    FINANCIAL_DOCUMENT_TYPES,
    ensure_clinical_document_access,
)
from app.domains.clinical.persistence.consentimiento import Consentimiento
from app.domains.clinical.persistence.documento import DocumentoPaciente
from app.domains.clinical.schemas.consentimientos import (
    ConsentimientoFirmar,
    ConsentimientoResponse,
)
from app.domains.patients.application.pacientes import _build_response
from app.domains.patients.application.portal_invitation_service import hash_portal_token
from app.domains.patients.persistence.paciente import Paciente
from app.domains.patients.persistence.portal_invitation import PortalInvitation
from app.domains.patients.schemas.portal import (
    PortalMeResponse,
    PortalPublicCambioRequest,
    PortalPublicCancelRequest,
    PortalPublicCitaResponse,
    PortalPublicConsentimientoResponse,
    PortalPublicDocumentoResponse,
    PortalPublicFirmarRequest,
    PortalPublicMeResponse,
    PortalPublicPaciente,
    PortalSolicitarCambioCita,
    PortalTokenRequest,
)
from app.domains.scheduling.application.citas import (
    _get_cita_or_404,
    _registrar_cambio_cita,
    _snapshot_cita,
    _to_response,
)
from app.domains.scheduling.persistence.cita import (
    Cita,
    CitaCambio,
    CitaTelefonear,
    HistorialFaltas,
)
from app.domains.scheduling.schemas.cita import CitaCancelar, CitaResponse

PORTAL_CITA_ESTADOS_BLOQUEADOS = {"anulada", "falta", "cancelled_by_patient", "atendida", "en_clinica", "en_atencion"}


_PORTAL_PUBLIC_RATE_LIMIT: dict[str, list[datetime]] = {}


async def _get_portal_paciente(
    db: AsyncSession,
    current_user: TokenData,
    paciente_id: UUID | None,
) -> Paciente:
    if current_user.rol == ROLE_PACIENTE:
        if current_user.paciente_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Portal paciente no vinculado a una ficha clinica.",
            )
        if paciente_id is not None and paciente_id != current_user.paciente_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puede acceder a datos de otro paciente.",
            )
        paciente_id = current_user.paciente_id
    elif paciente_id is not None and current_user.rol not in {ROLE_ADMIN, ROLE_DOCTOR, ROLE_RECEPCION}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puede previsualizar el portal paciente.",
        )

    if paciente_id is None:
        detail = "Seleccione un paciente para previsualizar el portal."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    result = await db.execute(
        select(Paciente)
        .options(selectinload(Paciente.referencias))
        .where(Paciente.id == paciente_id)
    )
    paciente = result.scalar_one_or_none()
    if not paciente or getattr(paciente, "deleted_at", None) is not None or paciente.activo is False:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


def _ensure_public_portal_rate_limit(request: Request) -> None:
    now = datetime.now(UTC)
    key = _client_ip(request)
    attempts = [
        item for item in _PORTAL_PUBLIC_RATE_LIMIT.get(key, [])
        if item >= now - timedelta(minutes=1)
    ]
    if len(attempts) >= 20:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espere un minuto.")
    attempts.append(now)
    _PORTAL_PUBLIC_RATE_LIMIT[key] = attempts


async def _get_public_invitation(
    db: AsyncSession,
    token: str,
    request: Request,
    *,
    mark_access: bool = True,
) -> tuple[PortalInvitation, Paciente]:
    _ensure_public_portal_rate_limit(request)
    token_hash = hash_portal_token(token)
    invitation = await db.scalar(select(PortalInvitation).where(PortalInvitation.token_hash == token_hash))
    if not invitation:
        raise HTTPException(status_code=404, detail={"code": "invalid", "message": "Invitacion no valida."})
    now = datetime.now(UTC)
    if invitation.estado == "revocada" or invitation.revoked_at is not None:
        raise HTTPException(status_code=410, detail={"code": "revoked", "message": "Invitacion revocada."})
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        invitation.estado = "expirada"
        await db.commit()
        raise HTTPException(status_code=410, detail={"code": "expired", "message": "Invitacion caducada."})
    paciente = await db.get(Paciente, invitation.paciente_id)
    if not paciente or getattr(paciente, "deleted_at", None) is not None or paciente.activo is False:
        raise HTTPException(status_code=404, detail={"code": "patient_not_found", "message": "Paciente no disponible."})
    if paciente.clinica_id != invitation.clinica_id:
        raise HTTPException(status_code=403, detail={"code": "clinic_mismatch", "message": "Invitacion no valida."})
    if mark_access:
        if invitation.used_at is None:
            invitation.used_at = now
        invitation.last_access_at = now
        invitation.access_count = (invitation.access_count or 0) + 1
    return invitation, paciente


async def _public_portal_counts(db: AsyncSession, paciente: Paciente) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    citas_count = await db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= now,
            Cita.estado.notin_(tuple(PORTAL_CITA_ESTADOS_BLOQUEADOS)),
        )
    )
    documentos_count = await db.scalar(
        select(func.count(DocumentoPaciente.id)).where(
            DocumentoPaciente.paciente_id == paciente.id,
            DocumentoPaciente.deleted_at.is_(None),
        )
    )
    consentimientos_count = await db.scalar(
        select(func.count(Consentimiento.id)).where(
            Consentimiento.paciente_id == paciente.id,
            Consentimiento.estado == "pendiente_firma",
            Consentimiento.revocado.is_(False),
        )
    )
    return {
        "proximas_citas": int(citas_count or 0),
        "documentos": int(documentos_count or 0),
        "consentimientos_pendientes": int(consentimientos_count or 0),
    }


def _public_cita_response(cita: Cita) -> PortalPublicCitaResponse:
    return PortalPublicCitaResponse(
        id=cita.id,
        fecha_hora=cita.fecha_hora,
        duracion_min=cita.duracion_min,
        estado=cita.estado,
        motivo=cita.motivo,
        doctor_nombre=cita.doctor.nombre if cita.doctor else None,
    )


def _public_documento_response(doc: DocumentoPaciente) -> PortalPublicDocumentoResponse:
    return PortalPublicDocumentoResponse(
        id=doc.id,
        nombre_original=doc.nombre_original,
        mime_type=doc.mime_type,
        tamano_bytes=doc.tamano_bytes,
        categoria=doc.categoria,
        descripcion=doc.descripcion,
        fecha_documento=doc.fecha_documento.isoformat() if doc.fecha_documento else None,
        created_at=doc.created_at,
    )


def _public_consentimiento_response(item: Consentimiento) -> PortalPublicConsentimientoResponse:
    return PortalPublicConsentimientoResponse(
        id=item.id,
        tipo=item.tipo,
        estado=item.estado,
        fecha_firma=item.fecha_firma.isoformat(),
        firmado_at=item.firmado_at,
        contenido=item.contenido,
        hash_documento=item.hash_documento,
        revocado=item.revocado,
    )


async def _get_public_cita(db: AsyncSession, cita_id: UUID, paciente: Paciente) -> Cita:
    cita = await db.scalar(
        select(Cita)
        .options(selectinload(Cita.doctor))
        .where(Cita.id == cita_id, Cita.paciente_id == paciente.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


async def _registrar_cambio_cita_publico(
    db: AsyncSession,
    *,
    invitation: PortalInvitation,
    cita: Cita,
    accion: str,
    old_values: dict | None,
    new_values: dict | None,
    motivo: str | None,
    request: Request,
) -> None:
    old_values = old_values or {}
    new_values = new_values or {}
    db.add(CitaCambio(
        cita_id=cita.id,
        usuario_id=None,
        accion=accion,
        estado_anterior=old_values.get("estado"),
        estado_nuevo=new_values.get("estado"),
        fecha_anterior=datetime.fromisoformat(old_values["fecha_hora"]) if old_values.get("fecha_hora") else None,
        fecha_nueva=datetime.fromisoformat(new_values["fecha_hora"]) if new_values.get("fecha_hora") else None,
        doctor_anterior_id=UUID(old_values["doctor_id"]) if old_values.get("doctor_id") else None,
        doctor_nuevo_id=UUID(new_values["doctor_id"]) if new_values.get("doctor_id") else None,
        motivo=motivo,
        datos={"antes": old_values, "despues": new_values, "portal_invitation_id": str(invitation.id)},
    ))
    await write_audit_log(
        db,
        user=None,
        action=f"PORTAL_PUBLIC_CITA_{accion.upper()}",
        entity_type="citas",
        entity_id=cita.id,
        old_values=old_values,
        new_values={**new_values, "portal_invitation_id": str(invitation.id)},
        clinica_id=invitation.clinica_id,
        request=request,
    )


async def portal_public_validate(data: PortalTokenRequest, request: Request, db: AsyncSession) -> PortalPublicMeResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    await write_audit_log(
        db,
        user=None,
        action="PORTAL_PUBLIC_VALIDAR",
        entity_type="portal_invitations",
        entity_id=invitation.id,
        new_values={"paciente_id": str(paciente.id), "access_count": invitation.access_count},
        clinica_id=invitation.clinica_id,
        request=request,
    )
    response = PortalPublicMeResponse(
        paciente=PortalPublicPaciente(nombre=paciente.nombre, apellidos=paciente.apellidos),
        resumen=await _public_portal_counts(db, paciente),
        expires_at=invitation.expires_at,
    )
    await db.commit()
    return response


async def portal_public_me(data: PortalTokenRequest, request: Request, db: AsyncSession) -> PortalPublicMeResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    response = PortalPublicMeResponse(
        paciente=PortalPublicPaciente(nombre=paciente.nombre, apellidos=paciente.apellidos),
        resumen=await _public_portal_counts(db, paciente),
        expires_at=invitation.expires_at,
    )
    await db.commit()
    return response


async def portal_public_citas(data: PortalTokenRequest, request: Request, db: AsyncSession) -> list[PortalPublicCitaResponse]:
    _, paciente = await _get_public_invitation(db, data.token, request)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.doctor))
        .where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= datetime.now(timezone.utc),
            Cita.estado.notin_(tuple(PORTAL_CITA_ESTADOS_BLOQUEADOS)),
        )
        .order_by(Cita.fecha_hora)
    )
    response = [_public_cita_response(cita) for cita in result.scalars().all()]
    await db.commit()
    return response


async def portal_public_confirmar_cita(cita_id: UUID, data: PortalTokenRequest, request: Request, db: AsyncSession) -> PortalPublicCitaResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    cita = await _get_public_cita(db, cita_id, paciente)
    _ensure_cita_modificable_desde_portal(cita)
    old = _snapshot_cita(cita)
    cita.estado = "confirmada"
    cita.confirmado_at = cita.confirmado_at or datetime.now(timezone.utc)
    await _registrar_cambio_cita_publico(
        db,
        invitation=invitation,
        cita=cita,
        accion="portal_confirmar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo="Confirmada desde invitacion portal",
        request=request,
    )
    response = _public_cita_response(cita)
    await db.commit()
    return response


async def portal_public_cancelar_cita(cita_id: UUID, data: PortalPublicCancelRequest, request: Request, db: AsyncSession) -> PortalPublicCitaResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    cita = await _get_public_cita(db, cita_id, paciente)
    _ensure_cita_modificable_desde_portal(cita)
    old = _snapshot_cita(cita)
    cita.estado = "anulada"
    cita.motivo_cancelacion = data.motivo_cancelacion
    cita.observaciones = f"{cita.observaciones or ''}\nPortal paciente: {data.motivo_cancelacion}".strip()
    tipo_falta = "anulacion_paciente"
    db.add(HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo=tipo_falta,
        fecha=datetime.now(timezone.utc),
        notas=data.motivo_cancelacion,
    ))
    if data.reprogramar:
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Reprogramar solicitud desde portal",
            notas=data.motivo_cancelacion,
        ))
    await _registrar_cambio_cita_publico(
        db,
        invitation=invitation,
        cita=cita,
        accion="portal_cancelar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo_cancelacion,
        request=request,
    )
    response = _public_cita_response(cita)
    await db.commit()
    return response


async def portal_public_solicitar_cambio_cita(cita_id: UUID, data: PortalPublicCambioRequest, request: Request, db: AsyncSession) -> PortalPublicCitaResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    cita = await _get_public_cita(db, cita_id, paciente)
    _ensure_cita_modificable_desde_portal(cita, allow_reschedule_requested=True)
    old = _snapshot_cita(cita)
    motivo = data.motivo.strip() or "Solicita cambiar la cita desde portal paciente"
    if cita.estado != "reschedule_requested":
        cita.estado = "reschedule_requested"
    cita.recordatorio_estado = "solicita_cambio"
    cita.observaciones = f"{cita.observaciones or ''}\nPortal paciente: {motivo}".strip()
    existing_request = await db.scalar(
        select(CitaTelefonear).where(
            CitaTelefonear.cita_original_id == cita.id,
            CitaTelefonear.reubicada.is_(False),
        )
    )
    if existing_request:
        existing_request.motivo = "Solicitud de cambio desde portal"
        existing_request.notas = motivo
        existing_request.proximo_intento_at = data.proximo_intento_at
    else:
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Solicitud de cambio desde portal",
            notas=motivo,
            proximo_intento_at=data.proximo_intento_at,
        ))
    await _registrar_cambio_cita_publico(
        db,
        invitation=invitation,
        cita=cita,
        accion="portal_solicitar_cambio",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=motivo,
        request=request,
    )
    response = _public_cita_response(cita)
    await db.commit()
    return response


async def portal_public_documentos(data: PortalTokenRequest, request: Request, db: AsyncSession) -> list[PortalPublicDocumentoResponse]:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    result = await db.execute(
        select(DocumentoPaciente)
        .where(DocumentoPaciente.paciente_id == paciente.id, DocumentoPaciente.deleted_at.is_(None))
        .order_by(DocumentoPaciente.created_at.desc())
    )
    await write_audit_log(
        db,
        user=None,
        action="PORTAL_PUBLIC_DOCUMENTOS_LISTAR",
        entity_type="documentos_paciente",
        entity_id=paciente.id,
        new_values={"portal_invitation_id": str(invitation.id)},
        clinica_id=invitation.clinica_id,
        request=request,
    )
    response = [_public_documento_response(doc) for doc in result.scalars().all()]
    await db.commit()
    return response


async def portal_public_descargar_documento(doc_id: UUID, data: PortalTokenRequest, request: Request, db: AsyncSession) -> FileResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    doc = await db.get(DocumentoPaciente, doc_id)
    if not doc or doc.paciente_id != paciente.id or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    ruta_abs = UPLOAD_ROOT / str(paciente.id) / doc.nombre_guardado
    if not ruta_abs.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    await write_audit_log(
        db,
        user=None,
        action="PORTAL_PUBLIC_DOCUMENTO_DESCARGAR",
        entity_type="documentos_paciente",
        entity_id=doc.id,
        new_values={"portal_invitation_id": str(invitation.id), "categoria": doc.categoria},
        clinica_id=invitation.clinica_id,
        request=request,
    )
    response = FileResponse(
        path=str(ruta_abs),
        media_type=doc.mime_type,
        filename=doc.nombre_original,
        headers={"Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff"},
    )
    await db.commit()
    return response


async def portal_public_consentimientos(data: PortalTokenRequest, request: Request, db: AsyncSession) -> list[PortalPublicConsentimientoResponse]:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    result = await db.execute(
        select(Consentimiento)
        .where(
            Consentimiento.paciente_id == paciente.id,
            Consentimiento.estado == "pendiente_firma",
            Consentimiento.revocado.is_(False),
        )
        .order_by(Consentimiento.created_at.desc())
    )
    await write_audit_log(
        db,
        user=None,
        action="PORTAL_PUBLIC_CONSENTIMIENTOS_LISTAR",
        entity_type="consentimientos",
        entity_id=paciente.id,
        new_values={"portal_invitation_id": str(invitation.id)},
        clinica_id=invitation.clinica_id,
        request=request,
    )
    response = [_public_consentimiento_response(item) for item in result.scalars().all()]
    await db.commit()
    return response


async def portal_public_firmar_consentimiento(consentimiento_id: UUID, data: PortalPublicFirmarRequest, request: Request, db: AsyncSession) -> PortalPublicConsentimientoResponse:
    invitation, paciente = await _get_public_invitation(db, data.token, request)
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if (
        not consentimiento
        or consentimiento.paciente_id != paciente.id
        or consentimiento.estado != "pendiente_firma"
        or consentimiento.revocado
    ):
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    _firma_png_bytes(data.firma_paciente_base64)
    consentimiento.firma_paciente_base64 = data.firma_paciente_base64
    consentimiento.estado = "firmado"
    consentimiento.firmado_at = datetime.now(timezone.utc)
    consentimiento.fecha_firma = datetime.now(timezone.utc).date()
    consentimiento.ip_firma = _client_ip(request)
    consentimiento.user_agent_firma = request.headers.get("User-Agent", "")[:500] or None

    pdf_bytes = _generar_pdf_consentimiento(consentimiento, paciente)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    consentimiento.hash_documento = pdf_hash

    filename = f"consentimiento_{consentimiento.tipo.lower().replace(' ', '_')}_{consentimiento.id}.pdf"
    stored_name = f"{uuid.uuid4()}.pdf"
    path = _ruta_consentimiento_paciente(paciente.id) / stored_name
    path.write_bytes(pdf_bytes)
    relative_path = str(Path("pacientes") / str(paciente.id) / stored_name)
    documento = DocumentoPaciente(
        paciente_id=paciente.id,
        nombre_original=filename[:255],
        nombre_guardado=stored_name,
        ruta=relative_path,
        mime_type="application/pdf",
        tamano_bytes=len(pdf_bytes),
        categoria="consentimiento",
        descripcion=f"Consentimiento informado - {consentimiento.tipo}",
        fecha_documento=datetime.now(timezone.utc).date(),
        tratamiento_id=consentimiento.tratamiento_id,
        historial_id=consentimiento.historial_id,
        doctor_id=consentimiento.doctor_id,
        etiquetas=f"consentimiento,{consentimiento.tipo}",
    )
    db.add(documento)
    await db.flush()
    consentimiento.documento_id = documento.id
    consentimiento.documento_path = relative_path
    await write_audit_log(
        db,
        user=None,
        action="PORTAL_PUBLIC_CONSENTIMIENTO_FIRMAR",
        entity_type="consentimientos",
        entity_id=consentimiento.id,
        new_values={
            "estado": "firmado",
            "hash_documento": pdf_hash,
            "documento_id": str(documento.id),
            "portal_invitation_id": str(invitation.id),
        },
        clinica_id=invitation.clinica_id,
        request=request,
    )
    response = _public_consentimiento_response(consentimiento)
    await db.commit()
    return response


async def _ensure_cita_de_paciente(db: AsyncSession, cita_id: UUID, paciente: Paciente, current_user: TokenData) -> Cita:
    cita = await _get_cita_or_404(db, cita_id, lock=True)
    ensure_clinic_access(current_user, cita.clinica_id)
    if cita.paciente_id != paciente.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cita no encontrada")
    return cita


def _ensure_cita_modificable_desde_portal(
    cita: Cita,
    *,
    allow_reschedule_requested: bool = False,
) -> None:
    fecha_cita = cita.fecha_hora
    if fecha_cita.tzinfo is None:
        fecha_cita = fecha_cita.replace(tzinfo=timezone.utc)
    if fecha_cita <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita ya no admite cambios desde el portal paciente.",
        )
    if cita.estado in PORTAL_CITA_ESTADOS_BLOQUEADOS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita esta cerrada o debe gestionarse con la clinica.",
        )
    if cita.estado == "reschedule_requested" and not allow_reschedule_requested:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita ya tiene una solicitud de cambio pendiente.",
        )


async def portal_me(db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> PortalMeResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    now = datetime.now(timezone.utc)
    citas_count = await db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= now,
            Cita.estado.notin_(tuple(PORTAL_CITA_ESTADOS_BLOQUEADOS)),
        )
    )
    documentos_count = await db.scalar(
        select(func.count(DocumentoPaciente.id)).where(
            DocumentoPaciente.paciente_id == paciente.id,
            DocumentoPaciente.deleted_at.is_(None),
        )
    )
    consentimientos_count = await db.scalar(
        select(func.count(Consentimiento.id)).where(
            Consentimiento.paciente_id == paciente.id,
            Consentimiento.estado == "pendiente_firma",
            Consentimiento.revocado.is_(False),
        )
    )
    return PortalMeResponse(
        paciente=await _build_response(db, paciente, include_health=False),
        resumen={
            "proximas_citas": int(citas_count or 0),
            "documentos": int(documentos_count or 0),
            "consentimientos_pendientes": int(consentimientos_count or 0),
        },
    )


async def portal_citas(db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> list[CitaResponse]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor), selectinload(Cita.gabinete))
        .where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= datetime.now(timezone.utc),
            Cita.estado.notin_(tuple(PORTAL_CITA_ESTADOS_BLOQUEADOS)),
        )
        .order_by(Cita.fecha_hora)
    )
    return [await _to_response(db, cita) for cita in result.scalars().all()]


async def portal_confirmar_cita(cita_id: UUID, request: Request, db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> CitaResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    cita = await _ensure_cita_de_paciente(db, cita_id, paciente, current_user)
    _ensure_cita_modificable_desde_portal(cita)
    old = _snapshot_cita(cita)
    cita.estado = "confirmada"
    cita.confirmado_at = cita.confirmado_at or datetime.now(timezone.utc)
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="portal_confirmar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo="Confirmada desde portal paciente",
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


async def portal_cancelar_cita(cita_id: UUID, data: CitaCancelar, request: Request, db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> CitaResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    cita = await _ensure_cita_de_paciente(db, cita_id, paciente, current_user)
    _ensure_cita_modificable_desde_portal(cita)
    old = _snapshot_cita(cita)
    cita.estado = "anulada"
    cita.motivo_cancelacion = data.motivo_cancelacion
    cita.observaciones = f"{cita.observaciones or ''}\nPortal paciente: {data.motivo_cancelacion}".strip()
    tipo_falta = "anulacion_paciente" if data.tipo != "no_vino" else "falta"
    db.add(HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo=tipo_falta,
        fecha=datetime.now(timezone.utc),
        notas=data.motivo_cancelacion,
    ))
    if data.crear_telefonear or data.tipo == "reprogramada":
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Reprogramar solicitud desde portal",
            notas=data.motivo_cancelacion,
            proximo_intento_at=data.proximo_intento_at,
        ))
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="portal_cancelar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo_cancelacion,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


async def portal_solicitar_cambio_cita(cita_id: UUID, data: PortalSolicitarCambioCita, request: Request, db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> CitaResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    cita = await _ensure_cita_de_paciente(db, cita_id, paciente, current_user)
    _ensure_cita_modificable_desde_portal(cita, allow_reschedule_requested=True)

    old = _snapshot_cita(cita)
    motivo = data.motivo.strip() or "Solicita cambiar la cita desde portal paciente"
    if cita.estado != "reschedule_requested":
        cita.estado = "reschedule_requested"
    cita.recordatorio_estado = "solicita_cambio"
    cita.observaciones = f"{cita.observaciones or ''}\nPortal paciente: {motivo}".strip()

    existing_request = await db.scalar(
        select(CitaTelefonear).where(
            CitaTelefonear.cita_original_id == cita.id,
            CitaTelefonear.reubicada.is_(False),
        )
    )
    if existing_request:
        existing_request.motivo = "Solicitud de cambio desde portal"
        existing_request.notas = motivo
        existing_request.proximo_intento_at = data.proximo_intento_at
    else:
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Solicitud de cambio desde portal",
            notas=motivo,
            proximo_intento_at=data.proximo_intento_at,
        ))

    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="portal_solicitar_cambio",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=motivo,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


async def portal_documentos(db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> list[dict]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    stmt = (
        select(DocumentoPaciente)
        .where(DocumentoPaciente.paciente_id == paciente.id, DocumentoPaciente.deleted_at.is_(None))
        .order_by(DocumentoPaciente.created_at.desc())
    )
    if current_user.rol != ROLE_PACIENTE and not can_view_health_data(current_user):
        stmt = stmt.where(DocumentoPaciente.categoria.in_(ADMIN_DOCUMENT_TYPES))
    if current_user.rol != ROLE_PACIENTE and current_user.rol not in BILLING_ROLES:
        stmt = stmt.where(DocumentoPaciente.categoria.not_in(FINANCIAL_DOCUMENT_TYPES))
    result = await db.execute(stmt)
    documentos = result.scalars().all()
    await write_audit_log(
        db,
        user=current_user,
        action="PORTAL_DOCUMENTOS_LISTAR",
        entity_type="documentos_paciente",
        entity_id=paciente.id,
        clinica_id=paciente.clinica_id,
    )
    await db.commit()
    return [_doc_to_dict(doc) for doc in documentos]


async def portal_consentimientos(db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> list[ConsentimientoResponse]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    ensure_clinical_document_access(current_user, paciente.id)
    result = await db.execute(
        select(Consentimiento)
        .where(Consentimiento.paciente_id == paciente.id)
        .order_by(Consentimiento.created_at.desc())
    )
    await write_audit_log(
        db,
        user=current_user,
        action="PORTAL_CONSENTIMIENTOS_LISTAR",
        entity_type="consentimientos",
        entity_id=paciente.id,
        clinica_id=paciente.clinica_id,
    )
    await db.commit()
    return [ConsentimientoResponse.model_validate(item) for item in result.scalars().all()]


async def portal_firmar_consentimiento(consentimiento_id: UUID, data: ConsentimientoFirmar, request: Request, db: AsyncSession, current_user: TokenData, paciente_id: UUID | None) -> ConsentimientoResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if not consentimiento or consentimiento.paciente_id != paciente.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consentimiento no encontrado")
    return await firmar_consentimiento(consentimiento_id, data, db, current_user, request)
