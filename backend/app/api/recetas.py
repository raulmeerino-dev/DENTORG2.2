"""Recetas privadas/locales con plantillas y proveedor externo preparado."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.crypto import descifrar_paciente
from app.core.permissions import (
    CurrentUser,
    RequireDoctor,
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.doctor import Doctor
from app.models.documento import DocumentoPaciente
from app.models.paciente import Paciente
from app.models.receta import RecetaClinica, RecetaPlantilla
from app.schemas.receta import (
    RecetaAnularRequest,
    RecetaCreate,
    RecetaEmitirRequest,
    RecetaFirmaUpdate,
    RecetaPlantillaResponse,
    RecetaPlantillaUpdate,
    RecetaProviderStatus,
    RecetaResponse,
    RecetaUpdate,
)
from app.services.audit import write_audit_log
from app.services.pdf_service import (
    InvalidSignatureError,
    generar_receta_local_desde_plantilla_pdf,
    pdf_response_headers,
    signature_png_data_url,
    validate_pdf_bytes,
    validate_signature_data_url,
)
from app.services.receta_provider_service import get_receta_provider, provider_status_payload

router = APIRouter()

PLANTILLA_ROOT = Path("uploads/recetas/plantillas")
PACIENTE_UPLOAD_ROOT = Path("uploads/pacientes")
PLANTILLA_MIME_PERMITIDOS = {
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
}
FINAL_STATES = {"emitida_local", "enviada_proveedor", "certificada", "rechazada", "anulada", "dispensada"}


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def _clean_filename(filename: str | None, fallback: str = "plantilla_receta") -> str:
    cleaned = Path(filename or fallback).name.replace("\x00", "").strip()
    return cleaned[:255] or fallback


def _mime_por_firma(contenido: bytes) -> str | None:
    if contenido.startswith(b"%PDF-"):
        return "application/pdf"
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if contenido.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if contenido.startswith(b"RIFF") and contenido[8:12] == b"WEBP":
        return "image/webp"
    return None


def _validar_plantilla(nombre_original: str, contenido: bytes, content_type: str | None) -> tuple[str, str]:
    if not contenido:
        raise HTTPException(status_code=422, detail="La plantilla esta vacia")
    if len(contenido) > get_settings().max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La plantilla supera el tamano maximo permitido")
    mime = _mime_por_firma(contenido)
    if mime not in PLANTILLA_MIME_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Plantilla no permitida. Use PDF, PNG, JPG o WEBP.")
    declarado = (content_type or "").split(";")[0].strip().lower()
    if declarado and declarado != "application/octet-stream" and declarado != mime:
        raise HTTPException(status_code=415, detail="El MIME declarado no coincide con el contenido de la plantilla")
    ext = Path(nombre_original).suffix.lower()
    if ext and ext not in PLANTILLA_MIME_PERMITIDOS[mime]:
        raise HTTPException(status_code=415, detail="La extension no coincide con el contenido de la plantilla")
    if not ext:
        ext = next(iter(PLANTILLA_MIME_PERMITIDOS[mime]))
    return mime, ext


def _template_dir(clinica_id) -> Path:
    folder = PLANTILLA_ROOT / (str(clinica_id) if clinica_id else "global")
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _safe_template_path(plantilla: RecetaPlantilla) -> Path:
    if Path(plantilla.nombre_guardado).name != plantilla.nombre_guardado:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    base = (PLANTILLA_ROOT / (str(plantilla.clinica_id) if plantilla.clinica_id else "global")).resolve()
    path = (base / plantilla.nombre_guardado).resolve()
    if path.parent != base:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return path


def _safe_patient_file(paciente_id: uuid.UUID, stored_name: str) -> Path:
    if Path(stored_name).name != stored_name:
        raise HTTPException(status_code=404, detail="PDF final no encontrado")
    base = (PACIENTE_UPLOAD_ROOT / str(paciente_id)).resolve()
    path = (base / stored_name).resolve()
    if path.parent != base:
        raise HTTPException(status_code=404, detail="PDF final no encontrado")
    return path


async def _get_paciente(db: AsyncSession, paciente_id: uuid.UUID, current_user: TokenData | None = None) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if current_user:
        ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


async def _get_doctor(db: AsyncSession, doctor_id: uuid.UUID, paciente: Paciente, current_user: CurrentUser) -> Doctor:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    if doctor.clinica_id is not None and paciente.clinica_id is not None and doctor.clinica_id != paciente.clinica_id:
        raise HTTPException(status_code=400, detail="Doctor de otra clinica")
    if doctor.clinica_id is not None:
        ensure_clinic_access(current_user, doctor.clinica_id)
    return doctor


async def _get_plantilla(db: AsyncSession, plantilla_id: uuid.UUID, current_user: CurrentUser) -> RecetaPlantilla:
    plantilla = await db.get(RecetaPlantilla, plantilla_id)
    if not plantilla or not plantilla.activo:
        raise HTTPException(status_code=404, detail="Plantilla de receta no encontrada")
    ensure_clinic_access(current_user, plantilla.clinica_id)
    return plantilla


async def _get_receta_or_404(db: AsyncSession, receta_id: uuid.UUID, current_user: CurrentUser) -> RecetaClinica:
    receta = await db.scalar(
        select(RecetaClinica)
        .options(selectinload(RecetaClinica.doctor), selectinload(RecetaClinica.plantilla))
        .where(RecetaClinica.id == receta_id, RecetaClinica.activo.is_(True))
    )
    if not receta:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    ensure_clinic_access(current_user, receta.clinica_id)
    return receta


def _to_response(receta: RecetaClinica) -> RecetaResponse:
    response = RecetaResponse.model_validate(receta)
    response.certificada_real = receta.provider_mode == "real" and receta.estado in {"certificada", "dispensada"}
    return response


def _validar_firma_opcional(data_url: str | None) -> str | None:
    if not data_url:
        return None
    try:
        firma_png = validate_signature_data_url(data_url, require_visible=True)
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return signature_png_data_url(firma_png)


def _apply_receta_payload(receta: RecetaClinica, data: RecetaCreate | RecetaUpdate, doctor: Doctor | None = None) -> None:
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in {"doctor_id", "firma_data_url"}:
            continue
        if hasattr(receta, field):
            setattr(receta, field, value)
    if data.firma_data_url is not None:
        receta.firma_data_url = _validar_firma_opcional(data.firma_data_url)
    if doctor:
        receta.prescriptor_nombre = doctor.nombre
        if not receta.prescriptor_especialidad:
            receta.prescriptor_especialidad = doctor.especialidad


async def _validate_ready_to_issue(
    db: AsyncSession,
    receta: RecetaClinica,
    paciente: Paciente,
    current_user: CurrentUser,
    plantilla_id: uuid.UUID | None = None,
) -> tuple[RecetaPlantilla, dict]:
    if receta.estado in FINAL_STATES:
        raise HTTPException(status_code=409, detail="Una receta emitida/certificada no se puede modificar ni reemitir")
    target_plantilla_id = plantilla_id or receta.plantilla_id
    if not target_plantilla_id:
        raise HTTPException(status_code=422, detail="Seleccione una plantilla oficial/importada antes de emitir")
    plantilla = await _get_plantilla(db, target_plantilla_id, current_user)
    receta.plantilla_id = plantilla.id

    descifrados = await descifrar_paciente(db, paciente)
    patient_dni = descifrados.get("dni_nie") or paciente.dni_nie
    missing: list[str] = []
    if not paciente.nombre or not paciente.apellidos:
        missing.append("nombre y apellidos del paciente")
    if plantilla.requiere_dni and not patient_dni:
        missing.append("DNI/NIE del paciente")
    if plantilla.requiere_fecha_nacimiento and not paciente.fecha_nacimiento:
        missing.append("fecha de nacimiento del paciente")
    required_fields = {
        "medicamento": receta.medicamento,
        "posologia": receta.posologia,
        "unidades/envases": receta.unidades,
        "duracion": receta.duracion,
        "fecha de prescripcion": receta.fecha_prescripcion,
        "numero de colegiado": receta.prescriptor_num_colegiado,
        "colegio": receta.prescriptor_colegio,
        "provincia": receta.prescriptor_provincia,
    }
    missing.extend(label for label, value in required_fields.items() if not value)
    if missing:
        receta.estado = "pendiente_validacion"
        raise HTTPException(status_code=422, detail=f"Faltan datos obligatorios: {', '.join(missing)}")

    template_path = _safe_template_path(plantilla)
    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Archivo de plantilla no encontrado")
    payload = {
        "receta_id": str(receta.id),
        "paciente_id": str(paciente.id),
        "paciente_nombre": f"{paciente.apellidos}, {paciente.nombre}",
        "paciente_dni": patient_dni,
        "paciente_fecha_nacimiento": paciente.fecha_nacimiento,
        "doctor_nombre": receta.prescriptor_nombre or (receta.doctor.nombre if receta.doctor else None),
        "num_colegiado": receta.prescriptor_num_colegiado,
        "colegio": receta.prescriptor_colegio,
        "provincia": receta.prescriptor_provincia,
        "especialidad": receta.prescriptor_especialidad,
        "medicamento": receta.medicamento,
        "principio_activo": receta.principio_activo,
        "forma_farmaceutica": receta.forma_farmaceutica,
        "via_administracion": receta.via_administracion,
        "unidades": receta.unidades,
        "duracion": receta.duracion,
        "posologia": receta.posologia,
        "diagnostico": receta.diagnostico,
        "instrucciones_paciente": receta.instrucciones_paciente,
        "fecha_prescripcion": receta.fecha_prescripcion,
        "plantilla_path": str(template_path),
        "plantilla_mime": plantilla.mime_type,
        "campos_config": plantilla.campos_config,
    }
    return plantilla, payload


async def _archive_pdf_final(
    db: AsyncSession,
    *,
    receta: RecetaClinica,
    paciente: Paciente,
    pdf_bytes: bytes,
    filename: str,
) -> DocumentoPaciente:
    validate_pdf_bytes(pdf_bytes)
    folder = PACIENTE_UPLOAD_ROOT / str(paciente.id)
    folder.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}.pdf"
    path = folder / stored_name
    path.write_bytes(pdf_bytes)
    relative_path = str(Path("pacientes") / str(paciente.id) / stored_name)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    documento = DocumentoPaciente(
        paciente_id=paciente.id,
        nombre_original=filename[:255],
        nombre_guardado=stored_name,
        ruta=relative_path,
        mime_type="application/pdf",
        tamano_bytes=len(pdf_bytes),
        categoria="receta",
        descripcion=f"Receta {receta.estado} - {receta.medicamento or 'borrador'}",
        fecha_documento=receta.fecha_prescripcion,
        doctor_id=receta.doctor_id,
        etiquetas=f"receta,{receta.estado},sha256:{pdf_hash},provider:{receta.provider_mode}",
    )
    db.add(documento)
    await db.flush()
    receta.pdf_documento_id = documento.id
    receta.pdf_path = relative_path
    receta.pdf_hash_sha256 = pdf_hash
    receta.pdf_generado_at = datetime.now(timezone.utc)
    return documento


@router.get("/provider-status", response_model=RecetaProviderStatus)
async def receta_provider_status(_: CurrentUser) -> RecetaProviderStatus:
    return RecetaProviderStatus(**provider_status_payload())


@router.get("/plantillas", response_model=list[RecetaPlantillaResponse])
async def listar_plantillas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[RecetaPlantillaResponse]:
    stmt = select(RecetaPlantilla).where(RecetaPlantilla.activo.is_(True)).order_by(RecetaPlantilla.nombre)
    stmt = scope_select_by_clinic(stmt, RecetaPlantilla, current_user)
    result = await db.execute(stmt)
    return [RecetaPlantillaResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/plantillas", response_model=RecetaPlantillaResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireDoctor])
async def importar_plantilla(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    archivo: UploadFile = File(...),
    nombre: str = Form(...),
    campos_config: str | None = Form(None),
    requiere_dni: bool = Form(True),
    requiere_fecha_nacimiento: bool = Form(False),
) -> RecetaPlantillaResponse:
    contenido = await archivo.read()
    nombre_original = _clean_filename(archivo.filename)
    mime, ext = _validar_plantilla(nombre_original, contenido, archivo.content_type)
    try:
        campos = json.loads(campos_config) if campos_config else None
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="campos_config debe ser JSON valido") from exc
    clinica_id = current_user.clinica_id
    stored_name = f"{uuid.uuid4()}{ext}"
    path = _template_dir(clinica_id) / stored_name
    path.write_bytes(contenido)
    plantilla = RecetaPlantilla(
        clinica_id=clinica_id,
        nombre=nombre.strip()[:150],
        nombre_original=nombre_original,
        nombre_guardado=stored_name,
        ruta=str(Path("recetas") / "plantillas" / (str(clinica_id) if clinica_id else "global") / stored_name),
        mime_type=mime,
        tamano_bytes=len(contenido),
        campos_config=campos,
        requiere_dni=requiere_dni,
        requiere_fecha_nacimiento=requiere_fecha_nacimiento,
    )
    db.add(plantilla)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="RECETA_PLANTILLA_IMPORTAR",
        entity_type="receta_plantillas",
        entity_id=plantilla.id,
        new_values={"nombre": plantilla.nombre, "mime_type": mime},
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(plantilla)
    return RecetaPlantillaResponse.model_validate(plantilla)


@router.patch("/plantillas/{plantilla_id}", response_model=RecetaPlantillaResponse, dependencies=[RequireDoctor])
async def actualizar_plantilla(
    plantilla_id: uuid.UUID,
    data: RecetaPlantillaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaPlantillaResponse:
    plantilla = await _get_plantilla(db, plantilla_id, current_user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plantilla, field, value)
    await write_audit_log(db, user=current_user, action="RECETA_PLANTILLA_EDITAR", entity_type="receta_plantillas", entity_id=plantilla.id, new_values=data.model_dump(exclude_unset=True), clinica_id=plantilla.clinica_id, request=request)
    await db.commit()
    await db.refresh(plantilla)
    return RecetaPlantillaResponse.model_validate(plantilla)


@router.get("", response_model=list[RecetaResponse])
async def listar_recetas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[RecetaResponse]:
    if paciente_id is None and current_user.clinica_id is None and current_user.rol != "admin":
        raise HTTPException(status_code=400, detail="paciente_id es obligatorio")
    stmt = (
        select(RecetaClinica)
        .options(selectinload(RecetaClinica.doctor), selectinload(RecetaClinica.plantilla))
        .where(RecetaClinica.activo.is_(True))
        .order_by(RecetaClinica.fecha_prescripcion.desc(), RecetaClinica.created_at.desc())
        .limit(limit)
    )
    if paciente_id is not None:
        paciente = await _get_paciente(db, paciente_id, current_user)
        stmt = stmt.where(RecetaClinica.paciente_id == paciente.id)
    elif current_user.clinica_id is not None:
        stmt = stmt.where(RecetaClinica.clinica_id == current_user.clinica_id)
    result = await db.execute(stmt)
    return [_to_response(receta) for receta in result.scalars().all()]


@router.post("/pacientes/{paciente_id}", response_model=RecetaResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireDoctor])
async def crear_receta(
    paciente_id: uuid.UUID,
    data: RecetaCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    paciente = await _get_paciente(db, paciente_id, current_user)
    doctor = await _get_doctor(db, data.doctor_id, paciente, current_user)
    clinica_id = resolve_clinic_id(current_user, paciente.clinica_id)
    if data.plantilla_id:
        await _get_plantilla(db, data.plantilla_id, current_user)
    receta = RecetaClinica(
        paciente_id=paciente.id,
        doctor_id=doctor.id,
        clinica_id=clinica_id,
        fecha_prescripcion=data.fecha_prescripcion or date.today(),
        estado="borrador",
        provider_mode=get_settings().receta_provider,
    )
    _apply_receta_payload(receta, data, doctor)
    db.add(receta)
    await db.flush()
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    await write_audit_log(db, user=current_user, action="RECETA_BORRADOR_CREAR", entity_type="recetas_clinicas", entity_id=receta.id, new_values={"paciente_id": str(paciente.id), "doctor_id": str(doctor.id)}, clinica_id=clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.get("/{receta_id}", response_model=RecetaResponse)
async def obtener_receta(receta_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    return _to_response(receta)


@router.patch("/{receta_id}", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def actualizar_receta(
    receta_id: uuid.UUID,
    data: RecetaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    if receta.estado in FINAL_STATES:
        raise HTTPException(status_code=409, detail="Una receta emitida/certificada no se puede modificar; anule o duplique")
    doctor = None
    if data.doctor_id:
        paciente = await _get_paciente(db, receta.paciente_id, current_user)
        doctor = await _get_doctor(db, data.doctor_id, paciente, current_user)
        receta.doctor_id = doctor.id
    _apply_receta_payload(receta, data, doctor)
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    await write_audit_log(db, user=current_user, action="RECETA_BORRADOR_EDITAR", entity_type="recetas_clinicas", entity_id=receta.id, new_values=data.model_dump(exclude_unset=True), clinica_id=receta.clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.post("/{receta_id}/firma", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def firmar_receta(receta_id: uuid.UUID, data: RecetaFirmaUpdate, request: Request, db: Annotated[AsyncSession, Depends(get_db)], current_user: CurrentUser) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    if receta.estado in FINAL_STATES:
        raise HTTPException(status_code=409, detail="Una receta emitida/certificada no se puede modificar")
    receta.firma_data_url = _validar_firma_opcional(data.firma_data_url)
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    await write_audit_log(db, user=current_user, action="RECETA_FIRMAR", entity_type="recetas_clinicas", entity_id=receta.id, clinica_id=receta.clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.post("/{receta_id}/emitir-local", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def emitir_receta_local(
    receta_id: uuid.UUID,
    data: RecetaEmitirRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    paciente = await _get_paciente(db, receta.paciente_id, current_user)
    plantilla, payload = await _validate_ready_to_issue(db, receta, paciente, current_user, data.plantilla_id)
    receta.provider_mode = get_settings().receta_provider
    receta.verification_code = f"LOCAL-{uuid.uuid4().hex[:12].upper()}"
    pdf_bytes = generar_receta_local_desde_plantilla_pdf(
        plantilla_path=payload["plantilla_path"],
        plantilla_mime=plantilla.mime_type,
        campos_config=plantilla.campos_config,
        data={**payload, "verification_code": receta.verification_code},
    )
    receta.estado = "emitida_local"
    receta.emitida_at = datetime.now(timezone.utc)
    receta.emitida_por_usuario_id = current_user.user_id
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    await _archive_pdf_final(db, receta=receta, paciente=paciente, pdf_bytes=pdf_bytes, filename=f"receta_local_{receta.fecha_prescripcion}_{str(receta.id)[:8]}.pdf")
    await write_audit_log(db, user=current_user, action="RECETA_EMITIR_LOCAL", entity_type="recetas_clinicas", entity_id=receta.id, new_values={"estado": receta.estado, "pdf_hash_sha256": receta.pdf_hash_sha256}, clinica_id=receta.clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.post("/{receta_id}/enviar-proveedor", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def enviar_receta_proveedor(
    receta_id: uuid.UUID,
    data: RecetaEmitirRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    provider = get_receta_provider()
    if provider.mode == "disabled":
        raise HTTPException(status_code=409, detail="Proveedor de receta no configurado. Solo puede emitir receta local no certificada.")
    receta = await _get_receta_or_404(db, receta_id, current_user)
    paciente = await _get_paciente(db, receta.paciente_id, current_user)
    plantilla, payload = await _validate_ready_to_issue(db, receta, paciente, current_user, data.plantilla_id)
    receta.estado = "enviada_proveedor"
    receta.provider_mode = provider.mode
    receta.enviada_proveedor_at = datetime.now(timezone.utc)
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    try:
        result = await provider.create_prescription({**payload, "plantilla_mime": plantilla.mime_type})
    except NotImplementedError as exc:
        receta.provider_error = str(exc)
        receta.estado = "rechazada"
        receta.rechazada_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    receta.external_id = result.external_id
    receta.provider_status = result.status
    receta.provider_error = result.error
    receta.verification_code = result.verification_code
    if result.error:
        receta.estado = "rechazada"
        receta.rechazada_at = datetime.now(timezone.utc)
    else:
        receta.estado = "certificada" if result.status.startswith("certificada") else "enviada_proveedor"
        if receta.estado == "certificada":
            receta.certificada_at = datetime.now(timezone.utc)
    if result.pdf_bytes:
        await _archive_pdf_final(db, receta=receta, paciente=paciente, pdf_bytes=result.pdf_bytes, filename=f"receta_provider_{receta.fecha_prescripcion}_{str(receta.id)[:8]}.pdf")
    await write_audit_log(db, user=current_user, action="RECETA_ENVIAR_PROVEEDOR", entity_type="recetas_clinicas", entity_id=receta.id, new_values={"estado": receta.estado, "provider_mode": receta.provider_mode, "external_id": receta.external_id}, clinica_id=receta.clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.post("/{receta_id}/anular", response_model=RecetaResponse, dependencies=[RequireDoctor])
async def anular_receta(
    receta_id: uuid.UUID,
    data: RecetaAnularRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    if receta.estado == "anulada":
        return _to_response(receta)
    provider = get_receta_provider()
    if receta.external_id and receta.provider_mode == provider.mode and provider.mode != "disabled":
        try:
            result = await provider.cancel_prescription(receta.external_id)
            receta.provider_status = result.status
        except Exception as exc:
            receta.provider_error = str(exc)
    receta.estado = "anulada"
    receta.anulada_at = datetime.now(timezone.utc)
    receta.anulada_por_usuario_id = current_user.user_id
    receta.motivo_anulacion = data.motivo
    receta.ip_ultima_accion = _client_ip(request)
    receta.user_agent_ultima_accion = request.headers.get("User-Agent", "")[:500] or None
    await write_audit_log(db, user=current_user, action="RECETA_ANULAR", entity_type="recetas_clinicas", entity_id=receta.id, new_values={"motivo": data.motivo}, clinica_id=receta.clinica_id, request=request)
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id, current_user)
    return _to_response(receta_completa)


@router.get("/{receta_id}/pdf")
async def pdf_receta(
    receta_id: uuid.UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FileResponse:
    receta = await _get_receta_or_404(db, receta_id, current_user)
    if not receta.pdf_documento_id:
        raise HTTPException(status_code=409, detail="La receta aun no tiene PDF final. Guarde borrador y emita receta local o envie a proveedor.")
    documento = await db.get(DocumentoPaciente, receta.pdf_documento_id)
    if not documento or documento.paciente_id != receta.paciente_id:
        raise HTTPException(status_code=404, detail="PDF final no encontrado")
    path = _safe_patient_file(receta.paciente_id, documento.nombre_guardado)
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF final no encontrado en disco")
    await write_audit_log(
        db,
        user=current_user,
        action="RECETA_PDF_ABRIR",
        entity_type="recetas_clinicas",
        entity_id=receta.id,
        new_values={"documento_id": str(documento.id), "pdf_hash_sha256": receta.pdf_hash_sha256},
        clinica_id=receta.clinica_id,
        request=request,
    )
    await db.commit()
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=documento.nombre_original,
        headers=pdf_response_headers(documento.nombre_original),
    )
