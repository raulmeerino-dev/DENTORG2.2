"""HTTP adapter: request validation, role dependencies and response contracts."""
import uuid
from datetime import date
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, TokenData, require_admin
from app.database import get_db
from app.domains.clinical.application import documentos as use_cases
from app.domains.clinical.schemas.documentos import DocumentoPdfCreate

router = APIRouter()


@router.get("/{paciente_id}/documentos")
async def listar_documentos(
    paciente_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    categoria: str | None = None,
):
    return await use_cases.listar_documentos(paciente_id=paciente_id, db=db, current_user=current_user, categoria=categoria)


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
    return await use_cases.subir_documento(paciente_id=paciente_id, request=request, db=db, current_user=current_user, archivo=archivo, categoria=categoria, descripcion=descripcion, fecha_documento=fecha_documento, tratamiento_id=tratamiento_id, historial_id=historial_id, doctor_id=doctor_id, etiquetas=etiquetas)


@router.post("/{paciente_id}/documentos/generar-pdf", status_code=status.HTTP_201_CREATED)
async def generar_documento_pdf(
    paciente_id: uuid.UUID,
    data: DocumentoPdfCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
):
    return await use_cases.generar_documento_pdf(paciente_id=paciente_id, data=data, db=db, current_user=current_user, request=request)


@router.get("/{paciente_id}/documentos/{doc_id}/descargar")
async def descargar_documento(
    paciente_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    return await use_cases.descargar_documento(paciente_id=paciente_id, doc_id=doc_id, db=db, current_user=current_user)


@router.delete("/{paciente_id}/documentos/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_documento(
    paciente_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
    motivo: str | None = Query(None, max_length=500),
):
    return await use_cases.eliminar_documento(paciente_id=paciente_id, doc_id=doc_id, db=db, current_user=current_user, request=request, motivo=motivo)
