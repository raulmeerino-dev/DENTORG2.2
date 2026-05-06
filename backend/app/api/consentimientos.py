"""Consentimientos informados versionados, firmables y archivables."""
import base64
import binascii
import hashlib
import uuid
from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from PIL import Image as PILImage, ImageFile
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    TokenData,
    ensure_clinic_access,
    require_admin,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.consentimiento import Consentimiento, ConsentimientoPlantilla
from app.models.documento import DocumentoPaciente
from app.models.paciente import Paciente
from app.services.audit import write_audit_log

router = APIRouter()

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


class PlantillaConsentimientoCreate(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=80)
    nombre: str = Field(..., min_length=1, max_length=150)
    tipo_tratamiento: str | None = Field(None, max_length=100)
    contenido: str = Field(..., min_length=20)
    clinica_id: uuid.UUID | None = None


class PlantillaConsentimientoResponse(BaseModel):
    id: uuid.UUID | None = None
    codigo: str
    nombre: str
    version: str
    version_num: int = 1
    tratamientos: list[str] = Field(default_factory=list)
    tipo_tratamiento: str | None = None
    contenido: str | None = None

    model_config = {"from_attributes": True}


class ConsentimientoCreate(BaseModel):
    tipo: str = Field(..., max_length=100)
    plantilla_id: uuid.UUID | None = None
    tratamiento_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    documento_id: uuid.UUID | None = None
    estado: str = Field("pendiente_firma", pattern=r"^(borrador|pendiente_firma|firmado|revocado)$")
    fecha_firma: date | None = None
    documento_path: str | None = Field(None, max_length=500)
    plantilla_version: str | None = Field(None, max_length=30)
    contenido: str | None = None


class ConsentimientoUpdate(BaseModel):
    estado: str | None = Field(None, pattern=r"^(borrador|pendiente_firma|firmado|revocado)$")
    documento_id: uuid.UUID | None = None
    documento_path: str | None = Field(None, max_length=500)
    contenido: str | None = None
    revocado: bool | None = None


class ConsentimientoFirmar(BaseModel):
    firma_paciente_base64: str = Field(..., min_length=30)
    firma_doctor_base64: str | None = None


class ConsentimientoRevocar(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=500)


class ConsentimientoResponse(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    clinica_id: uuid.UUID | None
    plantilla_id: uuid.UUID | None
    tratamiento_id: uuid.UUID | None
    doctor_id: uuid.UUID | None
    historial_id: uuid.UUID | None
    documento_id: uuid.UUID | None
    tipo: str
    estado: str
    fecha_firma: date
    firmado_at: datetime | None
    documento_path: str | None
    plantilla_version: str | None
    version_plantilla: int | None
    contenido: str | None
    hash_documento: str | None
    revocado: bool
    fecha_revocacion: date | None
    motivo_revocacion: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def _firma_png_bytes(data_url: str | None) -> bytes | None:
    if not data_url:
        return None
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="La firma debe ser una imagen PNG en data URL")
    try:
        return base64.b64decode(data_url[len(prefix):], validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="Firma digital no válida") from exc


def _firma_png_normalizada(data_url: str | None) -> bytes | None:
    raw = _firma_png_bytes(data_url)
    if not raw:
        return None
    try:
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        image = PILImage.open(BytesIO(raw))
        image.load()
        output = BytesIO()
        image.convert("RGBA").save(output, format="PNG")
        return output.getvalue()
    except OSError as exc:
        raise HTTPException(status_code=422, detail="Firma digital no valida") from exc


def _ruta_paciente(paciente_id: uuid.UUID) -> Path:
    path = UPLOAD_ROOT / str(paciente_id)
    path.mkdir(parents=True, exist_ok=True)
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


def _generar_pdf_consentimiento(consentimiento: Consentimiento, paciente: Paciente) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    nombre = " ".join(part for part in [paciente.nombre, paciente.apellidos] if part).strip()
    story = [
        Paragraph(f"Consentimiento informado - {consentimiento.tipo}", styles["Title"]),
        Spacer(1, 5 * mm),
        Paragraph(f"Paciente: {nombre}", styles["BodyText"]),
        Paragraph(f"Fecha: {consentimiento.fecha_firma.isoformat()}", styles["BodyText"]),
        Paragraph(f"Versión plantilla: {consentimiento.plantilla_version or consentimiento.version_plantilla or 'personalizada'}", styles["BodyText"]),
        Spacer(1, 6 * mm),
    ]
    for bloque in (consentimiento.contenido or "").replace("\r\n", "\n").split("\n\n"):
        texto = "<br/>".join(linea.strip() for linea in bloque.split("\n"))
        if texto.strip():
            story.append(Paragraph(texto, styles["BodyText"]))
            story.append(Spacer(1, 4 * mm))

    firma = _firma_png_normalizada(consentimiento.firma_paciente_base64)
    if firma:
        story.append(Spacer(1, 8 * mm))
        story.append(Paragraph("Firma del paciente", styles["Heading3"]))
        image = Image(BytesIO(firma), width=70 * mm, height=28 * mm)
        image.hAlign = "LEFT"
        story.append(image)
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(f"Firmado digitalmente: {consentimiento.firmado_at.isoformat() if consentimiento.firmado_at else ''}", styles["Italic"]))
    doc.build(story)
    return buffer.getvalue()


async def _get_paciente(db: AsyncSession, paciente_id: uuid.UUID, current_user: TokenData) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


async def _get_consentimiento(db: AsyncSession, consentimiento_id: uuid.UUID, current_user: TokenData) -> Consentimiento:
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if not consentimiento:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    ensure_clinic_access(current_user, consentimiento.clinica_id)
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


@router.get("/consentimientos/plantillas", response_model=list[PlantillaConsentimientoResponse])
async def listar_plantillas_consentimiento(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PlantillaConsentimientoResponse]:
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


@router.post("/consentimientos/plantillas", response_model=PlantillaConsentimientoResponse, status_code=status.HTTP_201_CREATED)
async def crear_plantilla_consentimiento(
    data: PlantillaConsentimientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PlantillaConsentimientoResponse:
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


@router.get("/pacientes/{paciente_id}/consentimientos", response_model=list[ConsentimientoResponse])
async def listar_consentimientos_paciente(
    paciente_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ConsentimientoResponse]:
    await _get_paciente(db, paciente_id, current_user)
    result = await db.execute(
        select(Consentimiento)
        .where(Consentimiento.paciente_id == paciente_id)
        .order_by(Consentimiento.created_at.desc())
    )
    return [ConsentimientoResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/pacientes/{paciente_id}/consentimientos", response_model=ConsentimientoResponse, status_code=status.HTTP_201_CREATED)
async def crear_consentimiento_paciente(
    paciente_id: uuid.UUID,
    data: ConsentimientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    paciente = await _get_paciente(db, paciente_id, current_user)
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

    firmado_at = datetime.now(timezone.utc) if data.estado == "firmado" else None
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
        firmado_at=firmado_at,
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


@router.patch("/pacientes/{paciente_id}/consentimientos/{consentimiento_id}", response_model=ConsentimientoResponse)
async def actualizar_consentimiento_paciente(
    paciente_id: uuid.UUID,
    consentimiento_id: uuid.UUID,
    data: ConsentimientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    await _get_paciente(db, paciente_id, current_user)
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    if consentimiento.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Consentimiento no encontrado")
    if consentimiento.estado == "firmado":
        raise HTTPException(status_code=409, detail="Un consentimiento firmado no se puede modificar")
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


@router.post("/consentimientos/{consentimiento_id}/firmar", response_model=ConsentimientoResponse)
async def firmar_consentimiento(
    consentimiento_id: uuid.UUID,
    data: ConsentimientoFirmar,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    if consentimiento.estado == "firmado":
        return ConsentimientoResponse.model_validate(consentimiento)
    if consentimiento.estado == "revocado":
        raise HTTPException(status_code=409, detail="No se puede firmar un consentimiento revocado")
    paciente = await _get_paciente(db, consentimiento.paciente_id, current_user)
    _firma_png_bytes(data.firma_paciente_base64)

    consentimiento.firma_paciente_base64 = data.firma_paciente_base64
    consentimiento.firma_doctor_base64 = data.firma_doctor_base64
    consentimiento.estado = "firmado"
    consentimiento.firmado_at = datetime.now(timezone.utc)
    consentimiento.fecha_firma = date.today()
    consentimiento.ip_firma = _client_ip(request)
    consentimiento.user_agent_firma = request.headers.get("User-Agent", "")[:500] or None

    pdf_bytes = _generar_pdf_consentimiento(consentimiento, paciente)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    consentimiento.hash_documento = pdf_hash

    filename = f"consentimiento_{consentimiento.tipo.lower().replace(' ', '_')}_{consentimiento.id}.pdf"
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
        etiquetas=f"consentimiento,{consentimiento.tipo}",
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
        new_values={"estado": "firmado", "hash_documento": pdf_hash, "documento_id": str(documento.id)},
        clinica_id=consentimiento.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(consentimiento)
    return ConsentimientoResponse.model_validate(consentimiento)


@router.post("/consentimientos/{consentimiento_id}/revocar", response_model=ConsentimientoResponse)
async def revocar_consentimiento(
    consentimiento_id: uuid.UUID,
    data: ConsentimientoRevocar,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> ConsentimientoResponse:
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


@router.get("/consentimientos/{consentimiento_id}/pdf")
async def descargar_pdf_consentimiento(
    consentimiento_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    consentimiento = await _get_consentimiento(db, consentimiento_id, current_user)
    paciente = await _get_paciente(db, consentimiento.paciente_id, current_user)
    if consentimiento.documento_id:
        documento = await db.get(DocumentoPaciente, consentimiento.documento_id)
        if documento:
            path = UPLOAD_ROOT / str(consentimiento.paciente_id) / documento.nombre_guardado
            if path.exists():
                return FileResponse(
                    path=str(path),
                    media_type="application/pdf",
                    filename=documento.nombre_original,
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )
    pdf_bytes = _generar_pdf_consentimiento(consentimiento, paciente)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="consentimiento_{consentimiento.id}.pdf"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
