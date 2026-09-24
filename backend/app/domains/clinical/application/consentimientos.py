"""Application use cases: tenant checks, orchestration and existing transactions."""
import hashlib
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import write_audit_log
from app.core.documents.pdf import (
    InvalidSignatureError,
    generar_documento_clinico_pdf,
    pdf_response_headers,
    safe_pdf_filename,
    signature_png_data_url,
    validate_pdf_bytes,
    validate_signature_data_url,
)
from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.domains.clinical.domain.document_access import ensure_clinical_document_access
from app.domains.clinical.persistence.consentimiento import Consentimiento, ConsentimientoPlantilla
from app.domains.clinical.persistence.documento import DocumentoPaciente
from app.domains.clinical.schemas.consentimientos import (
    ConsentimientoCreate,
    ConsentimientoFirmar,
    ConsentimientoResponse,
    ConsentimientoRevocar,
    ConsentimientoUpdate,
    PlantillaConsentimientoCreate,
    PlantillaConsentimientoResponse,
)
from app.domains.patients.persistence.paciente import Paciente

UPLOAD_ROOT = Path("uploads/pacientes")


PLANTILLAS_BASE = [
    {
        "codigo": "implantes",
        "nombre": "Implantes",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["implante", "cirugia"],
        "contenido": "D./Dña. {{paciente_nombre}} autoriza el tratamiento de implantes dentales indicado por la clínica. Se explican alternativas, riesgos quirúrgicos, posible fracaso del implante, controles posteriores y necesidad de higiene y revisiones.",
    },
    {
        "codigo": "extracciones",
        "nombre": "Extracciones",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["extraccion", "cirugia"],
        "contenido": "D./Dña. {{paciente_nombre}} autoriza la extracción dental indicada. Se informan riesgos de dolor, sangrado, infección, alveolitis, inflamación y posibles complicaciones anatómicas.",
    },
    {
        "codigo": "endodoncia",
        "nombre": "Endodoncia",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["endodoncia"],
        "contenido": "D./Dña. {{paciente_nombre}} autoriza el tratamiento de endodoncia. Se informa de pronóstico, controles, posible dolor postoperatorio, fractura, reinfección o necesidad de retratamiento/extracción.",
    },
    {
        "codigo": "ortodoncia",
        "nombre": "Ortodoncia",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["ortodoncia"],
        "contenido": "D./Dña. {{paciente_nombre}} acepta el tratamiento de ortodoncia y comprende la necesidad de colaboración, higiene, controles, retenedores y posibles variaciones del plan.",
    },
    {
        "codigo": "blanqueamiento",
        "nombre": "Blanqueamiento",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["blanqueamiento"],
        "contenido": "D./Dña. {{paciente_nombre}} autoriza el blanqueamiento dental. Se informa de sensibilidad temporal, limitaciones estéticas y necesidad de seguir las indicaciones profesionales.",
    },
    {
        "codigo": "limpieza",
        "nombre": "Limpieza / profilaxis",
        "version": "2026.04",
        "version_num": 1,
        "tratamientos": ["limpieza", "higiene"],
        "contenido": "D./Dña. {{paciente_nombre}} autoriza la higiene/profilaxis dental indicada. Se informa de posible sensibilidad, sangrado gingival temporal y recomendaciones de mantenimiento.",
    },
]


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def _firma_png_bytes(data_url: str | None) -> bytes | None:
    try:
        return validate_signature_data_url(data_url, require_visible=False)
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _firma_png_normalizada(data_url: str | None, *, require_visible: bool = False) -> bytes | None:
    try:
        return validate_signature_data_url(data_url, require_visible=require_visible)
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _ruta_paciente(paciente_id: uuid.UUID) -> Path:
    path = UPLOAD_ROOT / str(paciente_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_patient_file(paciente_id: uuid.UUID, stored_name: str) -> Path:
    if Path(stored_name).name != stored_name:
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    base = (UPLOAD_ROOT / str(paciente_id)).resolve()
    path = (base / stored_name).resolve()
    if path.parent != base:
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return path


def _render_template(contenido: str, paciente: Paciente, tipo: str) -> str:
    nombre = " ".join(part for part in [paciente.nombre, paciente.apellidos] if part).strip()
    replacements = {
        "{{paciente_nombre}}": nombre,
        "{{paciente_dni}}": paciente.dni_nie or "",
        "{{fecha}}": date.today().isoformat(),
        "{{tipo_tratamiento}}": tipo,
    }
    rendered = contenido
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)
    return rendered


def _hash_trazabilidad_consentimiento(
    consentimiento: Consentimiento,
    paciente: Paciente,
    firma_paciente_png: bytes | None,
) -> str:
    payload = "\n".join(
        [
            str(consentimiento.id),
            str(paciente.id),
            str(paciente.clinica_id or ""),
            consentimiento.tipo,
            consentimiento.fecha_firma.isoformat(),
            consentimiento.firmado_at.isoformat() if consentimiento.firmado_at else "",
            consentimiento.contenido or "",
            hashlib.sha256(firma_paciente_png or b"").hexdigest(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _generar_pdf_consentimiento(consentimiento: Consentimiento, paciente: Paciente) -> bytes:
    nombre = " ".join(part for part in [paciente.nombre, paciente.apellidos] if part).strip()
    version = consentimiento.plantilla_version or consentimiento.version_plantilla or "personalizada"
    firmado = consentimiento.firmado_at.isoformat() if consentimiento.firmado_at else ""
    firma_png = _firma_png_normalizada(consentimiento.firma_paciente_base64) if consentimiento.firma_paciente_base64 else None
    hash_trazabilidad = consentimiento.hash_documento or _hash_trazabilidad_consentimiento(
        consentimiento,
        paciente,
        firma_png,
    )
    contenido = (
        f"Fecha: {consentimiento.fecha_firma.isoformat()}\n"
        f"Version plantilla: {version}\n"
        f"Estado: {consentimiento.estado}\n"
        f"Firmado digitalmente: {firmado or 'pendiente'}\n"
        f"ID consentimiento: {consentimiento.id}\n"
        f"ID paciente: {paciente.id}\n"
        f"IP firma: {consentimiento.ip_firma or '-'}\n"
        f"Hash trazabilidad SHA-256: {hash_trazabilidad}\n\n"
        f"{consentimiento.contenido or ''}"
    )
    pdf_bytes = generar_documento_clinico_pdf(
        titulo=f"Consentimiento informado - {consentimiento.tipo}",
        contenido=contenido,
        paciente_nombre=nombre,
        fecha_documento=consentimiento.fecha_firma,
        firma_data_url=signature_png_data_url(firma_png),
    )
    validate_pdf_bytes(pdf_bytes)
    return pdf_bytes


async def _get_paciente(db: AsyncSession, paciente_id: uuid.UUID, current_user: TokenData) -> Paciente:
    ensure_clinical_document_access(current_user, paciente_id)
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


async def _get_consentimiento(db: AsyncSession, consentimiento_id: uuid.UUID, current_user: TokenData) -> Consentimiento:
    if current_user.rol != "paciente":
        ensure_clinical_document_access(current_user)
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if not consentimiento:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    ensure_clinical_document_access(current_user, consentimiento.paciente_id)
    ensure_clinic_access(current_user, consentimiento.clinica_id)
    await _get_paciente(db, consentimiento.paciente_id, current_user)
    return consentimiento


def _plantilla_base_to_response(item: dict) -> PlantillaConsentimientoResponse:
    return PlantillaConsentimientoResponse(
        codigo=item["codigo"],
        nombre=item["nombre"],
        version=item["version"],
        version_num=item["version_num"],
        tratamientos=item["tratamientos"],
        tipo_tratamiento=item["tratamientos"][0] if item["tratamientos"] else None,
        contenido=item["contenido"],
    )


async def listar_plantillas_consentimiento(db: AsyncSession, current_user: TokenData) -> list[PlantillaConsentimientoResponse]:
    stmt = select(ConsentimientoPlantilla).where(ConsentimientoPlantilla.activo == True).order_by(ConsentimientoPlantilla.nombre, ConsentimientoPlantilla.version.desc())  # noqa: E712
    stmt = scope_select_by_clinic(stmt, ConsentimientoPlantilla, current_user)
    result = await db.execute(stmt)
    plantillas = result.scalars().all()
    if not plantillas:
        return [_plantilla_base_to_response(item) for item in PLANTILLAS_BASE]
    return [
        PlantillaConsentimientoResponse(
            id=item.id,
            codigo=item.codigo,
            nombre=item.nombre,
            version=str(item.version),
            version_num=item.version,
            tratamientos=[item.tipo_tratamiento] if item.tipo_tratamiento else [],
            tipo_tratamiento=item.tipo_tratamiento,
            contenido=item.contenido,
        )
        for item in plantillas
    ]


async def crear_plantilla_consentimiento(data: PlantillaConsentimientoCreate, db: AsyncSession, current_user: TokenData, request: Request) -> PlantillaConsentimientoResponse:
    clinica_id = resolve_clinic_id(current_user, data.clinica_id)
    previous_version = await db.scalar(
        select(ConsentimientoPlantilla.version)
        .where(ConsentimientoPlantilla.codigo == data.codigo)
        .order_by(ConsentimientoPlantilla.version.desc())
        .limit(1)
    )
    plantilla = ConsentimientoPlantilla(
        clinica_id=clinica_id,
        codigo=data.codigo,
        nombre=data.nombre,
        tipo_tratamiento=data.tipo_tratamiento,
        version=(previous_version or 0) + 1,
        contenido=data.contenido,
        activo=True,
    )
    db.add(plantilla)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="CONSENTIMIENTO_PLANTILLA_CREAR",
        entity_type="consentimiento_plantillas",
        entity_id=plantilla.id,
        new_values={"codigo": plantilla.codigo, "version": plantilla.version},
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(plantilla)
    return PlantillaConsentimientoResponse(
        id=plantilla.id,
        codigo=plantilla.codigo,
        nombre=plantilla.nombre,
        version=str(plantilla.version),
        version_num=plantilla.version,
        tratamientos=[plantilla.tipo_tratamiento] if plantilla.tipo_tratamiento else [],
        tipo_tratamiento=plantilla.tipo_tratamiento,
        contenido=plantilla.contenido,
    )


async def listar_consentimientos_paciente(paciente_id: uuid.UUID, db: AsyncSession, current_user: TokenData) -> list[ConsentimientoResponse]:
    await _get_paciente(db, paciente_id, current_user)
    result = await db.execute(
        select(Consentimiento)
        .where(Consentimiento.paciente_id == paciente_id)
        .order_by(Consentimiento.created_at.desc())
    )
    return [ConsentimientoResponse.model_validate(c) for c in result.scalars().all()]


async def crear_consentimiento_paciente(paciente_id: uuid.UUID, data: ConsentimientoCreate, db: AsyncSession, current_user: TokenData, request: Request) -> ConsentimientoResponse:
    paciente = await _get_paciente(db, paciente_id, current_user)
    if data.estado == "firmado":
        raise HTTPException(status_code=422, detail="Use el endpoint de firma para marcar un consentimiento como firmado")
    plantilla = await db.get(ConsentimientoPlantilla, data.plantilla_id) if data.plantilla_id else None
    if plantilla:
        ensure_clinic_access(current_user, plantilla.clinica_id)
    base = data.contenido
    plantilla_version = data.plantilla_version
    version_plantilla = None
    if plantilla:
        base = base or plantilla.contenido
        plantilla_version = str(plantilla.version)
        version_plantilla = plantilla.version
    if not base:
        base_item = next((item for item in PLANTILLAS_BASE if item["nombre"] == data.tipo or item["codigo"] == data.tipo.lower()), None)
        base = base_item["contenido"] if base_item else "D./Dña. {{paciente_nombre}} recibe información suficiente sobre el tratamiento indicado y autoriza su realización."
        plantilla_version = plantilla_version or (base_item["version"] if base_item else "personalizada")
        version_plantilla = version_plantilla or (base_item["version_num"] if base_item else None)

    consentimiento = Consentimiento(
        paciente_id=paciente_id,
        clinica_id=paciente.clinica_id,
        plantilla_id=data.plantilla_id,
        tipo=data.tipo,
        tratamiento_id=data.tratamiento_id,
        doctor_id=data.doctor_id,
        historial_id=data.historial_id,
        documento_id=data.documento_id,
        estado=data.estado,
        fecha_firma=data.fecha_firma or date.today(),
        firmado_at=None,
        documento_path=data.documento_path,
        plantilla_version=plantilla_version,
        version_plantilla=version_plantilla,
        contenido=_render_template(base, paciente, data.tipo),
    )
    db.add(consentimiento)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="CONSENTIMIENTO_CREAR",
        entity_type="consentimientos",
        entity_id=consentimiento.id,
        new_values={"tipo": consentimiento.tipo, "estado": consentimiento.estado},
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


async def actualizar_consentimiento_paciente(paciente_id: uuid.UUID, consentimiento_id: uuid.UUID, data: ConsentimientoUpdate, db: AsyncSession, current_user: TokenData, request: Request) -> ConsentimientoResponse:
    await _get_paciente(db, paciente_id, current_user)
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    if consentimiento.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    if consentimiento.estado in {"firmado", "revocado"}:
        raise HTTPException(status_code=409, detail="Un consentimiento firmado o revocado no se puede modificar")
    cambios = data.model_dump(exclude_none=True)
    if cambios.get("estado") == "firmado":
        raise HTTPException(status_code=409, detail="Use el endpoint de firma")
    if cambios.get("estado") == "revocado" or cambios.get("revocado"):
        consentimiento.revocado = True
        consentimiento.estado = "revocado"
        consentimiento.fecha_revocacion = date.today()
    for field, value in cambios.items():
        setattr(consentimiento, field, value)
    await write_audit_log(
        db,
        user=current_user,
        action="CONSENTIMIENTO_EDITAR",
        entity_type="consentimientos",
        entity_id=consentimiento.id,
        new_values=cambios,
        clinica_id=consentimiento.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


async def firmar_consentimiento(consentimiento_id: uuid.UUID, data: ConsentimientoFirmar, db: AsyncSession, current_user: TokenData, request: Request) -> ConsentimientoResponse:
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    if consentimiento.estado == "firmado":
        return ConsentimientoResponse.model_validate(consentimiento)
    if consentimiento.estado == "revocado":
        raise HTTPException(status_code=409, detail="No se puede firmar un consentimiento revocado")
    paciente = await _get_paciente(db, consentimiento.paciente_id, current_user)
    firma_paciente_png = _firma_png_normalizada(data.firma_paciente_base64, require_visible=True)
    firma_doctor_png = _firma_png_normalizada(data.firma_doctor_base64, require_visible=True) if data.firma_doctor_base64 else None

    consentimiento.firma_paciente_base64 = signature_png_data_url(firma_paciente_png)
    consentimiento.firma_doctor_base64 = signature_png_data_url(firma_doctor_png)
    consentimiento.estado = "firmado"
    consentimiento.firmado_at = datetime.now(timezone.utc)
    consentimiento.fecha_firma = date.today()
    consentimiento.ip_firma = _client_ip(request)
    consentimiento.user_agent_firma = request.headers.get("User-Agent", "")[:500] or None
    consentimiento.hash_documento = _hash_trazabilidad_consentimiento(consentimiento, paciente, firma_paciente_png)

    pdf_bytes = _generar_pdf_consentimiento(consentimiento, paciente)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

    filename = safe_pdf_filename(
        f"consentimiento_{consentimiento.tipo.lower().replace(' ', '_')}_{consentimiento.id}.pdf"
    )
    stored_name = f"{uuid.uuid4()}.pdf"
    path = _ruta_paciente(paciente.id) / stored_name
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
        fecha_documento=date.today(),
        tratamiento_id=consentimiento.tratamiento_id,
        historial_id=consentimiento.historial_id,
        doctor_id=consentimiento.doctor_id,
        etiquetas=f"consentimiento,{consentimiento.tipo},hash_trazabilidad:{consentimiento.hash_documento},sha256_pdf:{pdf_hash}",
    )
    db.add(documento)
    await db.flush()
    consentimiento.documento_id = documento.id
    consentimiento.documento_path = relative_path

    await write_audit_log(
        db,
        user=current_user,
        action="CONSENTIMIENTO_FIRMAR",
        entity_type="consentimientos",
        entity_id=consentimiento.id,
        new_values={
            "estado": "firmado",
            "hash_documento": consentimiento.hash_documento,
            "sha256_pdf": pdf_hash,
            "documento_id": str(documento.id),
        },
        clinica_id=consentimiento.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


async def revocar_consentimiento(consentimiento_id: uuid.UUID, data: ConsentimientoRevocar, db: AsyncSession, current_user: TokenData, request: Request) -> ConsentimientoResponse:
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    consentimiento.revocado = True
    consentimiento.estado = "revocado"
    consentimiento.fecha_revocacion = date.today()
    consentimiento.motivo_revocacion = data.motivo
    await write_audit_log(
        db,
        user=current_user,
        action="CONSENTIMIENTO_REVOCAR",
        entity_type="consentimientos",
        entity_id=consentimiento.id,
        new_values={"motivo": data.motivo},
        clinica_id=consentimiento.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


async def descargar_pdf_consentimiento(consentimiento_id: uuid.UUID, db: AsyncSession, current_user: TokenData):
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    paciente = await _get_paciente(db, consentimiento.paciente_id, current_user)
    if consentimiento.documento_id:
        documento = await db.get(DocumentoPaciente, consentimiento.documento_id)
        if documento and documento.deleted_at is None:
            path = _safe_patient_file(consentimiento.paciente_id, documento.nombre_guardado)
            if path.exists():
                return FileResponse(
                    path=str(path),
                    media_type="application/pdf",
                    filename=documento.nombre_original,
                    headers=pdf_response_headers(documento.nombre_original),
                )
    pdf_bytes = _generar_pdf_consentimiento(consentimiento, paciente)
    validate_pdf_bytes(pdf_bytes)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers=pdf_response_headers(f"consentimiento_{consentimiento.id}.pdf"),
    )
