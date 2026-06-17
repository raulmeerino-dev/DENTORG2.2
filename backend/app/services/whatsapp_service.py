from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any

from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.crypto import descifrar_bytes
from app.core.permissions import TokenData
from app.models.cita import Cita, CitaCambio, CitaTelefonear, HistorialFaltas
from app.models.paciente import Paciente
from app.models.whatsapp import WhatsAppComunicacion
from app.schemas.whatsapp import WhatsAppRescheduleRequest, WhatsAppWebhookPayload
from app.services.agenda_service import (
    esta_dentro_disponibilidad,
    hay_solapamiento,
    hay_solapamiento_gabinete,
)
from app.services.audit import write_audit_log

AFFIRMATIVE_TERMS = {"si", "ok", "confirmo", "vale", "perfecto"}
RESCHEDULE_TERMS = {"no", "no puedo", "cancelar", "cambiar", "cambiarla", "cambio", "reprogramar", "reprogramarla", "anular"}
MATCHABLE_APPOINTMENT_STATES = {
    "programada",
    "confirmada",
    "pending_confirmation",
    "confirmed",
    "reminder_sent",
    "reschedule_requested",
    "pending_manual_review",
    "rescheduled",
}


@dataclass
class WhatsAppProcessResult:
    communication: WhatsAppComunicacion
    applied_status: str | None
    detail: str | None = None
    duplicate: bool = False


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    digits = "".join(ch for ch in value.replace("whatsapp:", "") if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    return digits or None


def _phones_match(left: str | None, right: str | None) -> bool:
    left_norm = normalize_phone(left)
    right_norm = normalize_phone(right)
    if not left_norm or not right_norm:
        return False
    if left_norm == right_norm:
        return True
    return len(left_norm) >= 9 and len(right_norm) >= 9 and (
        left_norm.endswith(right_norm) or right_norm.endswith(left_norm)
    )


def normalize_message(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def interpret_whatsapp_intent(message: str) -> str:
    normalized = normalize_message(message)
    if not normalized:
        return "pending_manual_review"
    if any(re.search(rf"(^|\s){re.escape(term)}(\s|$)", normalized) for term in RESCHEDULE_TERMS):
        return "reschedule_requested"
    if normalized in AFFIRMATIVE_TERMS or any(term in normalized.split() for term in AFFIRMATIVE_TERMS):
        return "affirmative"
    return "pending_manual_review"


def _first_meta_message(raw: dict[str, Any]) -> dict[str, Any] | None:
    entries = raw.get("entry")
    if not isinstance(entries, Sequence) or isinstance(entries, (str, bytes)):
        return None
    for entry in entries:
        changes = entry.get("changes") if isinstance(entry, dict) else None
        if not isinstance(changes, Sequence) or isinstance(changes, (str, bytes)):
            continue
        for change in changes:
            value = change.get("value") if isinstance(change, dict) else None
            messages = value.get("messages") if isinstance(value, dict) else None
            if isinstance(messages, Sequence) and not isinstance(messages, (str, bytes)) and messages:
                message = messages[0]
                return message if isinstance(message, dict) else None
    return None


def _payload_extra(payload: WhatsAppWebhookPayload) -> dict[str, Any]:
    return payload.model_extra or {}


def extract_message_body(payload: WhatsAppWebhookPayload) -> str:
    if payload.message_body:
        return payload.message_body
    if payload.body:
        return payload.body
    if payload.Body:
        return payload.Body
    if isinstance(payload.text, str):
        return payload.text
    if isinstance(payload.text, dict):
        body = payload.text.get("body") or payload.text.get("text")
        if body is not None:
            return str(body)
    meta_message = _first_meta_message(_payload_extra(payload))
    if meta_message:
        text = meta_message.get("text")
        if isinstance(text, dict) and text.get("body") is not None:
            return str(text["body"])
    return ""


def extract_phone(payload: WhatsAppWebhookPayload) -> str | None:
    meta_message = _first_meta_message(_payload_extra(payload))
    meta_phone = meta_message.get("from") if meta_message else None
    return normalize_phone(payload.from_phone or payload.phone or payload.wa_id or payload.From or meta_phone)


def extract_provider_message_id(payload: WhatsAppWebhookPayload) -> str | None:
    meta_message = _first_meta_message(_payload_extra(payload))
    meta_id = meta_message.get("id") if meta_message else None
    return payload.provider_message_id or payload.message_id or payload.MessageSid or meta_id


def build_idempotency_key(*, direction: str, provider_message_id: str | None, phone: str | None, raw_payload: dict[str, Any]) -> str | None:
    if provider_message_id:
        return f"{direction}:provider:{provider_message_id}"[:160]
    explicit_id = raw_payload.get("id") or raw_payload.get("event_id")
    if explicit_id:
        return f"{direction}:event:{explicit_id}"[:160]
    timestamp = raw_payload.get("timestamp") or raw_payload.get("received_at")
    if not timestamp:
        meta_message = _first_meta_message(raw_payload)
        timestamp = meta_message.get("timestamp") if meta_message else None
    if phone and timestamp:
        digest = sha256(repr(raw_payload).encode("utf-8", errors="replace")).hexdigest()
        return f"{direction}:hash:{digest}"[:160]
    return None


def _snapshot_cita(cita: Cita) -> dict[str, Any]:
    return {
        "doctor_id": str(cita.doctor_id),
        "gabinete_id": str(cita.gabinete_id) if cita.gabinete_id else None,
        "fecha_hora": cita.fecha_hora.isoformat(),
        "duracion_min": cita.duracion_min,
        "estado": cita.estado,
        "motivo": cita.motivo,
        "observaciones": cita.observaciones,
        "motivo_cancelacion": cita.motivo_cancelacion,
        "recordatorio_estado": cita.recordatorio_estado,
    }


async def _find_patient_by_phone(db: AsyncSession, phone: str | None) -> tuple[Paciente | None, str | None]:
    if not phone:
        return None, "Telefono entrante no informado."
    result = await db.execute(select(Paciente).where(Paciente.activo == True).order_by(Paciente.apellidos, Paciente.nombre))  # noqa: E712
    matches: list[Paciente] = []
    for paciente in result.scalars().all():
        telefono = await descifrar_bytes(db, paciente.telefono)
        telefono2 = await descifrar_bytes(db, paciente.telefono2)
        if _phones_match(phone, telefono) or _phones_match(phone, telefono2):
            matches.append(paciente)
    if len(matches) == 1:
        return matches[0], None
    if len(matches) > 1:
        return None, "Telefono asociado a mas de un paciente."
    return None, "No se encontro paciente por telefono."


async def _find_target_appointment(db: AsyncSession, paciente: Paciente | None) -> tuple[Cita | None, str | None]:
    if not paciente:
        return None, "No hay paciente asociado."
    since = datetime.now(timezone.utc) - timedelta(days=1)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= since,
            Cita.estado.in_(MATCHABLE_APPOINTMENT_STATES),
        )
        .order_by(Cita.recordatorio_enviado.desc(), Cita.recordatorio_at.desc(), Cita.fecha_hora)
    )
    cita = result.scalars().first()
    if cita:
        return cita, None
    return None, "No se encontro cita activa asociable."


async def _registrar_cambio_whatsapp(
    db: AsyncSession,
    *,
    cita: Cita,
    old_values: dict[str, Any],
    new_values: dict[str, Any],
    motivo: str,
    request: Request | None,
    user: TokenData | None = None,
    accion: str = "whatsapp_respuesta",
) -> None:
    db.add(CitaCambio(
        cita_id=cita.id,
        usuario_id=user.user_id if user else None,
        accion=accion,
        estado_anterior=old_values.get("estado"),
        estado_nuevo=new_values.get("estado"),
        fecha_anterior=datetime.fromisoformat(old_values["fecha_hora"]) if old_values.get("fecha_hora") else None,
        fecha_nueva=datetime.fromisoformat(new_values["fecha_hora"]) if new_values.get("fecha_hora") else None,
        motivo=motivo,
        datos={"antes": old_values, "despues": new_values, "origen": "whatsapp"},
    ))
    await write_audit_log(
        db,
        user=user,
        action="CITA_WHATSAPP_RESPUESTA",
        entity_type="citas",
        entity_id=cita.id,
        old_values=old_values,
        new_values=new_values,
        clinica_id=cita.clinica_id,
        request=request,
    )


async def _ensure_telefonear_for_reschedule(
    db: AsyncSession,
    *,
    cita: Cita,
    note: str | None,
) -> None:
    existing = await db.scalar(
        select(CitaTelefonear).where(
            CitaTelefonear.cita_original_id == cita.id,
            CitaTelefonear.reubicada == False,  # noqa: E712
        )
    )
    if existing:
        return
    db.add(CitaTelefonear(
        cita_original_id=cita.id,
        paciente_id=cita.paciente_id,
        doctor_id=cita.doctor_id,
        motivo="Reprogramacion solicitada por WhatsApp",
        notas=note,
        estado_contacto="pendiente",
    ))


async def record_outbound_whatsapp(
    db: AsyncSession,
    *,
    cita: Cita,
    message_body: str,
    provider_message_id: str | None = None,
    raw_payload: dict[str, Any] | None = None,
) -> WhatsAppComunicacion:
    now = datetime.now(timezone.utc)
    paciente = cita.paciente or await db.get(Paciente, cita.paciente_id)
    idempotency_key = build_idempotency_key(
        direction="outbound",
        provider_message_id=provider_message_id,
        phone=None,
        raw_payload=raw_payload or {},
    )
    communication = WhatsAppComunicacion(
        clinica_id=cita.clinica_id,
        patient_id=cita.paciente_id,
        appointment_id=cita.id,
        direction="outbound",
        phone=normalize_phone(await descifrar_bytes(db, paciente.telefono) if paciente and paciente.telefono else None),
        message_body=message_body,
        sent_at=now,
        interpreted_intent=None,
        processed=True,
        provider_message_id=provider_message_id,
        idempotency_key=idempotency_key,
        raw_payload=raw_payload,
    )
    db.add(communication)
    await db.flush()
    return communication


async def process_inbound_whatsapp(
    db: AsyncSession,
    *,
    payload: WhatsAppWebhookPayload,
    raw_payload: dict[str, Any],
    request: Request | None = None,
) -> WhatsAppProcessResult:
    phone = extract_phone(payload)
    message_body = extract_message_body(payload)[:2000]
    received_at = payload.received_at or datetime.now(timezone.utc)
    intent = interpret_whatsapp_intent(message_body)
    provider_message_id = extract_provider_message_id(payload)
    idempotency_key = build_idempotency_key(
        direction="inbound",
        provider_message_id=provider_message_id,
        phone=phone,
        raw_payload=raw_payload,
    )

    duplicate_filters = []
    if idempotency_key:
        duplicate_filters.append(WhatsAppComunicacion.idempotency_key == idempotency_key)
    if provider_message_id:
        duplicate_filters.append(
            (WhatsAppComunicacion.direction == "inbound")
            & (WhatsAppComunicacion.provider_message_id == provider_message_id)
        )
    if duplicate_filters:
        duplicate_result = await db.execute(
            select(WhatsAppComunicacion)
            .options(selectinload(WhatsAppComunicacion.cita))
            .where(or_(*duplicate_filters))
            .limit(1)
        )
        duplicate = duplicate_result.scalar_one_or_none()
        if duplicate:
            return WhatsAppProcessResult(
                communication=duplicate,
                applied_status=duplicate.cita.estado if duplicate.cita else None,
                detail="Webhook duplicado: respuesta ya registrada.",
                duplicate=True,
            )

    paciente, patient_detail = await _find_patient_by_phone(db, phone)
    cita, cita_detail = await _find_target_appointment(db, paciente)
    applied_status: str | None = None
    processed = False

    if cita:
        old = _snapshot_cita(cita)
        if intent == "affirmative":
            applied_status = "confirmed"
            cita.estado = applied_status
            cita.confirmado_at = cita.confirmado_at or received_at
            cita.recordatorio_estado = "confirmado"
            processed = True
        elif intent == "reschedule_requested":
            applied_status = "reschedule_requested"
            cita.estado = applied_status
            cita.recordatorio_estado = "solicita_cambio"
            await _ensure_telefonear_for_reschedule(db, cita=cita, note=message_body)
            processed = True
        else:
            applied_status = "pending_manual_review"
            cita.estado = applied_status
            cita.recordatorio_estado = "revision_manual"
            processed = False

        new = _snapshot_cita(cita)
        if old != new:
            await _registrar_cambio_whatsapp(
                db,
                cita=cita,
                old_values=old,
                new_values=new,
                motivo=f"Respuesta WhatsApp: {message_body or '[sin texto]'}",
                request=request,
            )

    detail = patient_detail or cita_detail
    communication = WhatsAppComunicacion(
        clinica_id=cita.clinica_id if cita else paciente.clinica_id if paciente else None,
        patient_id=paciente.id if paciente else None,
        appointment_id=cita.id if cita else None,
        direction="inbound",
        phone=phone,
        message_body=message_body or "[sin texto]",
        received_at=received_at,
        interpreted_intent=intent,
        processed=processed,
        provider_message_id=provider_message_id,
        idempotency_key=idempotency_key,
        raw_payload=raw_payload,
    )
    db.add(communication)
    await db.flush()
    return WhatsAppProcessResult(
        communication=communication,
        applied_status=applied_status,
        detail=detail,
    )


async def apply_whatsapp_action(
    db: AsyncSession,
    *,
    communication: WhatsAppComunicacion,
    action: str,
    note: str | None,
    user: TokenData,
    request: Request | None = None,
) -> str | None:
    cita = await db.get(Cita, communication.appointment_id) if communication.appointment_id else None
    applied_status: str | None = None

    if action in {"ignore", "mark_reviewed"}:
        communication.processed = True
        return None

    if action == "manual_review":
        communication.processed = False
        communication.interpreted_intent = "pending_manual_review"
        if cita:
            old = _snapshot_cita(cita)
            cita.estado = "pending_manual_review"
            cita.recordatorio_estado = "revision_manual"
            await _registrar_cambio_whatsapp(
                db,
                cita=cita,
                old_values=old,
                new_values=_snapshot_cita(cita),
                motivo=note or "Marcada para revision manual desde bandeja WhatsApp",
                request=request,
                user=user,
            )
            applied_status = cita.estado
        return applied_status

    if not cita:
        communication.processed = action in {"cancel", "mark_pending", "confirm"}
        return None

    old = _snapshot_cita(cita)
    if action == "confirm":
        cita.estado = "confirmed"
        cita.confirmado_at = cita.confirmado_at or datetime.now(timezone.utc)
        cita.recordatorio_estado = "confirmado_manual"
        communication.interpreted_intent = "affirmative"
        communication.processed = True
    elif action == "cancel":
        cita.estado = "cancelled_by_patient"
        cita.motivo_cancelacion = note or "Cancelada por respuesta WhatsApp"
        cita.recordatorio_estado = "cancelado_paciente"
        communication.interpreted_intent = "reschedule_requested"
        communication.processed = True
        db.add(HistorialFaltas(
            paciente_id=cita.paciente_id,
            cita_id=cita.id,
            tipo="anulacion_paciente",
            fecha=datetime.now(timezone.utc),
            notas=cita.motivo_cancelacion,
        ))
    elif action == "mark_pending":
        cita.estado = "reschedule_requested"
        cita.recordatorio_estado = "solicita_cambio"
        communication.interpreted_intent = "reschedule_requested"
        communication.processed = True
        await _ensure_telefonear_for_reschedule(db, cita=cita, note=note or communication.message_body)

    applied_status = cita.estado
    await _registrar_cambio_whatsapp(
        db,
        cita=cita,
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=note or f"Accion manual WhatsApp: {action}",
        request=request,
        user=user,
    )
    return applied_status


async def reschedule_whatsapp_appointment(
    db: AsyncSession,
    *,
    communication: WhatsAppComunicacion,
    data: WhatsAppRescheduleRequest,
    user: TokenData,
    request: Request | None = None,
) -> str:
    if not communication.appointment_id:
        raise ValueError("La comunicacion no tiene cita asociada.")
    cita = await db.get(Cita, communication.appointment_id)
    if not cita:
        raise ValueError("Cita no encontrada.")
    if data.forzar_fuera_horario and user.rol != "admin":
        raise ValueError("Solo admin puede forzar una cita fuera de horario.")

    duracion = data.duracion_min or cita.duracion_min
    gabinete_id = data.gabinete_id if data.gabinete_id is not None else cita.gabinete_id
    if not data.forzar_fuera_horario:
        if await hay_solapamiento(db, cita.doctor_id, data.fecha_hora, duracion, excluir_cita_id=cita.id):
            raise ValueError("El doctor ya tiene una cita en ese horario.")
        if await hay_solapamiento_gabinete(db, gabinete_id, data.fecha_hora, duracion, excluir_cita_id=cita.id):
            raise ValueError("El gabinete ya tiene una cita en ese horario.")
        if not await esta_dentro_disponibilidad(db, cita.doctor_id, data.fecha_hora, duracion):
            raise ValueError("La cita queda fuera del horario configurado del doctor.")

    old = _snapshot_cita(cita)
    cita.fecha_hora = data.fecha_hora
    cita.duracion_min = duracion
    cita.gabinete_id = gabinete_id
    cita.estado = "rescheduled"
    cita.recordatorio_estado = "reprogramada_manual"
    if data.note:
        cita.observaciones = f"{cita.observaciones or ''}\nReprogramada desde WhatsApp: {data.note}".strip()
    communication.processed = True
    communication.interpreted_intent = "reschedule_requested"

    result = await db.execute(
        select(CitaTelefonear).where(
            CitaTelefonear.cita_original_id == cita.id,
            CitaTelefonear.reubicada == False,  # noqa: E712
        )
    )
    for entrada in result.scalars().all():
        entrada.reubicada = True
        entrada.nueva_cita_id = cita.id
        entrada.estado_contacto = "cita_dada"
        entrada.ultimo_intento_at = datetime.now(timezone.utc)

    await _registrar_cambio_whatsapp(
        db,
        cita=cita,
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.note or "Reprogramacion manual desde bandeja WhatsApp",
        request=request,
        user=user,
        accion="whatsapp_reprogramar",
    )
    return cita.estado
