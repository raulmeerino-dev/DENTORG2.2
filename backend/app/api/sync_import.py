import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import cifrar_campos_paciente
from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.cita import Cita
from app.models.doctor import Doctor
from app.models.paciente import Paciente
from app.schemas.extras import ImportPaciente, ImportResponse, SyncRequest, SyncResponse

router = APIRouter()
import_router = APIRouter()


async def _create_patient_from_minimal(db: AsyncSession, data: dict) -> Paciente:
    cifrados = await cifrar_campos_paciente(
        db,
        {
            "dni_nie": data.get("dni_nie"),
            "telefono": data.get("telefono"),
            "telefono2": data.get("telefono2"),
            "email": data.get("email"),
        },
    )
    paciente = Paciente(
        nombre=data.get("nombre") or "Paciente",
        apellidos=data.get("apellidos") or "SIN APELLIDOS",
        observaciones=data.get("observaciones"),
        **cifrados,
    )
    db.add(paciente)
    await db.flush()
    return paciente


@router.post("", response_model=SyncResponse)
async def sincronizar_offline(
    payload: SyncRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> SyncResponse:
    patient_map = {}
    cita_map = {}
    for item in payload.pacientes:
        paciente = await _create_patient_from_minimal(db, item.model_dump())
        patient_map[item.idTemp] = paciente.id

    doctor_id = None
    if payload.citas:
        result = await db.execute(select(Doctor.id).where(Doctor.activo == True).limit(1))  # noqa: E712
        doctor_id = result.scalar_one_or_none()

    for item in payload.citas:
        target_patient_id = item.paciente_id or (patient_map.get(item.paciente_idTemp or "") if item.paciente_idTemp else None)
        target_doctor_id = item.doctor_id or doctor_id
        if not target_patient_id or not target_doctor_id:
            continue
        cita = Cita(
            paciente_id=target_patient_id,
            doctor_id=target_doctor_id,
            fecha_hora=item.fecha_hora,
            duracion_min=item.duracion_min,
            motivo=item.motivo,
        )
        db.add(cita)
        await db.flush()
        cita_map[item.idTemp] = cita.id
    await db.commit()
    return SyncResponse(pacientes=patient_map, citas=cita_map, pendientes=0)


@import_router.post("/pacientes", response_model=ImportResponse, dependencies=[RequireAdmin])
async def importar_pacientes(
    payload: list[ImportPaciente],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportResponse:
    errores = []
    creados = 0
    for index, item in enumerate(payload):
        try:
            if not item.nombre:
                raise ValueError("Nombre obligatorio")
            await _create_patient_from_minimal(db, item.model_dump())
            creados += 1
        except Exception as exc:
            errores.append({"fila": index + 1, "error": str(exc), "payload": json.loads(item.model_dump_json())})
    await db.commit()
    return ImportResponse(creados=creados, errores=errores)
