"""HTTP adapter: request validation, role dependencies and response contracts."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
)
from app.database import get_db
from app.domains.clinical.schemas.consentimientos import (
    ConsentimientoFirmar,
    ConsentimientoResponse,
)
from app.domains.patients.application import portal as use_cases
from app.domains.patients.schemas.portal import (
    PortalMeResponse,
    PortalPublicCambioRequest,
    PortalPublicCancelRequest,
    PortalPublicCitaResponse,
    PortalPublicConsentimientoResponse,
    PortalPublicDocumentoResponse,
    PortalPublicFirmarRequest,
    PortalPublicMeResponse,
    PortalSolicitarCambioCita,
    PortalTokenRequest,
)
from app.domains.scheduling.schemas.cita import CitaCancelar, CitaResponse

router = APIRouter()


@router.post("/public/validate", response_model=PortalPublicMeResponse)
async def portal_public_validate(
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicMeResponse:
    return await use_cases.portal_public_validate(data=data, request=request, db=db)


@router.post("/public/me", response_model=PortalPublicMeResponse)
async def portal_public_me(
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicMeResponse:
    return await use_cases.portal_public_me(data=data, request=request, db=db)


@router.post("/public/citas", response_model=list[PortalPublicCitaResponse])
async def portal_public_citas(
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PortalPublicCitaResponse]:
    return await use_cases.portal_public_citas(data=data, request=request, db=db)


@router.post("/public/citas/{cita_id}/confirmar", response_model=PortalPublicCitaResponse)
async def portal_public_confirmar_cita(
    cita_id: UUID,
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicCitaResponse:
    return await use_cases.portal_public_confirmar_cita(cita_id=cita_id, data=data, request=request, db=db)


@router.post("/public/citas/{cita_id}/cancelar", response_model=PortalPublicCitaResponse)
async def portal_public_cancelar_cita(
    cita_id: UUID,
    data: PortalPublicCancelRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicCitaResponse:
    return await use_cases.portal_public_cancelar_cita(cita_id=cita_id, data=data, request=request, db=db)


@router.post("/public/citas/{cita_id}/solicitar-cambio", response_model=PortalPublicCitaResponse)
async def portal_public_solicitar_cambio_cita(
    cita_id: UUID,
    data: PortalPublicCambioRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicCitaResponse:
    return await use_cases.portal_public_solicitar_cambio_cita(cita_id=cita_id, data=data, request=request, db=db)


@router.post("/public/documentos", response_model=list[PortalPublicDocumentoResponse])
async def portal_public_documentos(
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PortalPublicDocumentoResponse]:
    return await use_cases.portal_public_documentos(data=data, request=request, db=db)


@router.post("/public/documentos/{doc_id}/descargar")
async def portal_public_descargar_documento(
    doc_id: UUID,
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    return await use_cases.portal_public_descargar_documento(doc_id=doc_id, data=data, request=request, db=db)


@router.post("/public/consentimientos", response_model=list[PortalPublicConsentimientoResponse])
async def portal_public_consentimientos(
    data: PortalTokenRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PortalPublicConsentimientoResponse]:
    return await use_cases.portal_public_consentimientos(data=data, request=request, db=db)


@router.post("/public/consentimientos/{consentimiento_id}/firmar", response_model=PortalPublicConsentimientoResponse)
async def portal_public_firmar_consentimiento(
    consentimiento_id: UUID,
    data: PortalPublicFirmarRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortalPublicConsentimientoResponse:
    return await use_cases.portal_public_firmar_consentimiento(consentimiento_id=consentimiento_id, data=data, request=request, db=db)


@router.get("/me", response_model=PortalMeResponse)
async def portal_me(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> PortalMeResponse:
    return await use_cases.portal_me(db=db, current_user=current_user, paciente_id=paciente_id)


@router.get("/citas", response_model=list[CitaResponse])
async def portal_citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[CitaResponse]:
    return await use_cases.portal_citas(db=db, current_user=current_user, paciente_id=paciente_id)


@router.post("/citas/{cita_id}/confirmar", response_model=CitaResponse)
async def portal_confirmar_cita(
    cita_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> CitaResponse:
    return await use_cases.portal_confirmar_cita(cita_id=cita_id, request=request, db=db, current_user=current_user, paciente_id=paciente_id)


@router.post("/citas/{cita_id}/cancelar", response_model=CitaResponse)
async def portal_cancelar_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> CitaResponse:
    return await use_cases.portal_cancelar_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user, paciente_id=paciente_id)


@router.post("/citas/{cita_id}/solicitar-cambio", response_model=CitaResponse)
async def portal_solicitar_cambio_cita(
    cita_id: UUID,
    data: PortalSolicitarCambioCita,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> CitaResponse:
    return await use_cases.portal_solicitar_cambio_cita(cita_id=cita_id, data=data, request=request, db=db, current_user=current_user, paciente_id=paciente_id)


@router.get("/documentos")
async def portal_documentos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[dict]:
    return await use_cases.portal_documentos(db=db, current_user=current_user, paciente_id=paciente_id)


@router.get("/consentimientos", response_model=list[ConsentimientoResponse])
async def portal_consentimientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[ConsentimientoResponse]:
    return await use_cases.portal_consentimientos(db=db, current_user=current_user, paciente_id=paciente_id)


@router.post("/consentimientos/{consentimiento_id}/firmar", response_model=ConsentimientoResponse)
async def portal_firmar_consentimiento(
    consentimiento_id: UUID,
    data: ConsentimientoFirmar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> ConsentimientoResponse:
    return await use_cases.portal_firmar_consentimiento(consentimiento_id=consentimiento_id, data=data, request=request, db=db, current_user=current_user, paciente_id=paciente_id)
