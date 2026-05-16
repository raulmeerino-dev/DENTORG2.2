"""
Router de documentos de paciente.
Subida, listado, descarga y borrado de archivos adjuntos.
Los ficheros se guardan en: uploads/pacientes/{paciente_id}/{uuid}{ext}
"""
import os
import uuid
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import CurrentUser, ensure_clinic_access
from app.core.throttling import ensure_upload_allowed
from app.database import get_db
from app.models.documento import CATEGORIAS_DOCUMENTO, DocumentoPaciente
from app.models.paciente import Paciente
from app.services.pdf_service import generar_documento_clinico_pdf

router = APIRouter()
settings = get_settings()

UPLOAD_ROOT = Path("uploads/pacientes")
MIME_PERMITIDOS = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/tiff",
    "image/bmp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
EXTENSIONES_PERMITIDAS = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/gif": {".gif"},
    "image/webp": {".webp"},
    "image/tiff": {".tif", ".tiff"},
    "image/bmp": {".bmp"},
    "application/msword": {".doc"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
}
MAX_SIZE_BYTES = settings.max_upload_size_mb * 1024 * 1024


class DocumentoPdfCreate(BaseModel):
    titulo: str = Field(..., max_length=180)
    categoria: str = Field("otro", max_length=50)
    contenido: str = Field(..., max_length=20000)
    descripcion: str | None = Field(None, max_length=500)
    etiquetas: str | None = Field(None, max_length=500)
    fecha_documento: date | None = None
    tratamiento_id: uuid.UUID | None = None
    historial_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    firma_data_url: str | None = None


def _ruta_paciente(paciente_id: str) -> Path:
    p = UPLOAD_ROOT / paciente_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _sanear_nombre_archivo(nombre: str | None) -> str:
    limpio = Path(nombre or "documento").name.replace("\x00", "").strip()
    return limpio[:255] or "documento"


def _mime_por_firma(contenido: bytes) -> str | None:
    if contenido.startswith(b"%PDF-"):
        return "application/pdf"
    if contenido.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if contenido.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if contenido.startswith(b"RIFF") and contenido[8:12] == b"WEBP":
        return "image/webp"
    if contenido.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if contenido.startswith(b"BM"):
        return "image/bmp"
    if contenido.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "application/msword"
    return None


def _mime_docx_si_aplica(contenido: bytes) -> str | None:
    try:
        with ZipFile(BytesIO(contenido)) as zf:
            nombres = set(zf.namelist())
    except (BadZipFile, OSError):
        return None

    if "[Content_Types].xml" in nombres and any(nombre.startswith("word/") for nombre in nombres):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return None


def _validar_y_determinar_archivo(nombre_original: str, contenido: bytes) -> tuple[str, str]:
    mime = _mime_por_firma(contenido)
    if mime is None and contenido.startswith(b"PK"):
        mime = _mime_docx_si_aplica(contenido)

    if mime not in MIME_PERMITIDOS:
        raise HTTPException(
            status_code=415,
            detail="Tipo de archivo no permitido. Use PDF, imagenes o documentos Word validos.",
        )

    ext = Path(nombre_original).suffix.lower()
    extensiones_validas = EXTENSIONES_PERMITIDAS[mime]
    if ext and ext not in extensiones_validas:
        raise HTTPException(
            status_code=415,
            detail="La extension no coincide con el contenido real del archivo.",
        )
    if not ext:
        ext = next(iter(extensiones_validas))

    return mime, ext


@router.get("/{paciente_id}/documentos")
async def listar_documentos(
    paciente_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    categoria: str | None = None,
):
    pac = await db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)

    q = (
        select(DocumentoPaciente)
        .where(DocumentoPaciente.paciente_id == paciente_id)
        .order_by(DocumentoPaciente.created_at.desc())
    )
    if categoria:
        q = q.where(DocumentoPaciente.categoria == categoria)

    result = await db.execute(q)
    docs = result.scalars().all()
    return [_doc_to_dict(d) for d in docs]


@router.post("/{paciente_id}/documentos", status_code=status.HTTP_201_CREATED)
async def subir_documento(
    paciente_id: uuid.UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    archivo: UploadFile = File(...),
    categoria: str = Form("otro"),
    descripcion: str | None = Form(None),
    fecha_documento: date | None = Form(None),
    tratamiento_id: uuid.UUID | None = Form(None),
    historial_id: uuid.UUID | None = Form(None),
    doctor_id: uuid.UUID | None = Form(None),
    etiquetas: str | None = Form(None),
):
    pac = await db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)

    if categoria not in CATEGORIAS_DOCUMENTO:
        raise HTTPException(
            status_code=422,
            detail=f"Categoria invalida. Validas: {', '.join(CATEGORIAS_DOCUMENTO)}",
        )

    ensure_upload_allowed(request, str(paciente_id))

    contenido = await archivo.read()
    if len(contenido) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El archivo supera el limite de {settings.max_upload_size_mb} MB",
        )

    nombre_original = _sanear_nombre_archivo(archivo.filename)
    mime, ext = _validar_y_determinar_archivo(nombre_original, contenido)

    nombre_guardado = f"{uuid.uuid4()}{ext}"
    carpeta = _ruta_paciente(str(paciente_id))
    ruta_absoluta = carpeta / nombre_guardado
    ruta_absoluta.write_bytes(contenido)
    ruta_relativa = str(Path("pacientes") / str(paciente_id) / nombre_guardado)

    doc = DocumentoPaciente(
        paciente_id=paciente_id,
        nombre_original=nombre_original,
        nombre_guardado=nombre_guardado,
        ruta=ruta_relativa,
        mime_type=mime,
        tamano_bytes=len(contenido),
        categoria=categoria,
        descripcion=descripcion or None,
        fecha_documento=fecha_documento,
        tratamiento_id=tratamiento_id,
        historial_id=historial_id,
        doctor_id=doctor_id,
        etiquetas=etiquetas or None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_dict(doc)


@router.post("/{paciente_id}/documentos/generar-pdf", status_code=status.HTTP_201_CREATED)
async def generar_documento_pdf(
    paciente_id: uuid.UUID,
    data: DocumentoPdfCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    pac = await db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)
    if data.categoria not in CATEGORIAS_DOCUMENTO:
        raise HTTPException(
            status_code=422,
            detail=f"Categoria invalida. Validas: {', '.join(CATEGORIAS_DOCUMENTO)}",
        )

    paciente_nombre = " ".join(part for part in [pac.nombre, pac.apellidos] if part).strip()
    pdf_bytes = generar_documento_clinico_pdf(
        titulo=data.titulo,
        contenido=data.contenido,
        paciente_nombre=paciente_nombre,
        fecha_documento=data.fecha_documento,
        firma_data_url=data.firma_data_url,
    )
    nombre_limpio = _sanear_nombre_archivo(data.titulo).replace(" ", "_").lower()
    nombre_original = f"{nombre_limpio or 'documento'}.pdf"
    nombre_guardado = f"{uuid.uuid4()}.pdf"
    carpeta = _ruta_paciente(str(paciente_id))
    ruta_absoluta = carpeta / nombre_guardado
    ruta_absoluta.write_bytes(pdf_bytes)
    ruta_relativa = str(Path("pacientes") / str(paciente_id) / nombre_guardado)

    doc = DocumentoPaciente(
        paciente_id=paciente_id,
        nombre_original=nombre_original,
        nombre_guardado=nombre_guardado,
        ruta=ruta_relativa,
        mime_type="application/pdf",
        tamano_bytes=len(pdf_bytes),
        categoria=data.categoria,
        descripcion=data.descripcion or data.titulo,
        fecha_documento=data.fecha_documento or date.today(),
        tratamiento_id=data.tratamiento_id,
        historial_id=data.historial_id,
        doctor_id=data.doctor_id,
        etiquetas=data.etiquetas or None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_dict(doc)


@router.get("/{paciente_id}/documentos/{doc_id}/descargar")
async def descargar_documento(
    paciente_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    doc = await db.get(DocumentoPaciente, doc_id)
    if not doc or doc.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    pac = await db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)

    ruta_abs = UPLOAD_ROOT / str(paciente_id) / doc.nombre_guardado
    if not ruta_abs.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    return FileResponse(
        path=str(ruta_abs),
        media_type=doc.mime_type,
        filename=doc.nombre_original,
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{paciente_id}/documentos/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_documento(
    paciente_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    doc = await db.get(DocumentoPaciente, doc_id)
    if not doc or doc.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    pac = await db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, pac.clinica_id)

    ruta_abs = UPLOAD_ROOT / str(paciente_id) / doc.nombre_guardado
    if ruta_abs.exists():
        os.remove(ruta_abs)

    await db.delete(doc)
    await db.commit()


def _doc_to_dict(d: DocumentoPaciente) -> dict:
    return {
        "id": str(d.id),
        "paciente_id": str(d.paciente_id),
        "nombre_original": d.nombre_original,
        "ruta": d.ruta,
        "mime_type": d.mime_type,
        "tamano_bytes": d.tamano_bytes,
        "categoria": d.categoria,
        "descripcion": d.descripcion,
        "fecha_documento": d.fecha_documento.isoformat() if d.fecha_documento else None,
        "tratamiento_id": str(d.tratamiento_id) if d.tratamiento_id else None,
        "historial_id": str(d.historial_id) if d.historial_id else None,
        "doctor_id": str(d.doctor_id) if d.doctor_id else None,
        "etiquetas": d.etiquetas,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
