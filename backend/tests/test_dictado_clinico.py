from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.clinica import Clinica
from app.models.dictado import DictadoClinico
from app.models.doctor import Doctor
from app.models.historial import NotaDental
from app.models.paciente import Paciente
from app.models.usuario import Usuario
from app.services.audio_transcription_service import TranscriptionResult


async def auth_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    rol: str = "doctor",
    clinica_id=None,
    doctor_id=None,
) -> dict[str, str]:
    username = f"dictado-{rol}-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("usuario1234"),
        nombre="Usuario Dictado",
        rol=rol,
        clinica_id=clinica_id,
        doctor_id=doctor_id,
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "usuario1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def clinical_context(db_session: AsyncSession):
    clinica = Clinica(nombre=f"Clinica Dictado {uuid4().hex[:6]}", activa=True)
    db_session.add(clinica)
    await db_session.flush()
    doctor = Doctor(nombre="Dra. Dictado", color_agenda="#2563eb", activo=True, clinica_id=clinica.id)
    paciente = Paciente(nombre="Laura", apellidos="Dictado", clinica_id=clinica.id)
    db_session.add_all([clinica, doctor, paciente])
    await db_session.commit()
    return clinica, doctor, paciente


async def fake_transcriber(*_, **__) -> TranscriptionResult:
    return TranscriptionResult(text="Paciente refiere molestia en zona posterior. Revisar evolucion.", provider="test")


@pytest.mark.asyncio
async def test_doctor_puede_transcribir_para_paciente_de_su_clinica(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.api.dictado as dictado_api

    clinica, doctor, paciente = await clinical_context(db_session)
    headers = await auth_headers(client, db_session, rol="doctor", clinica_id=clinica.id, doctor_id=doctor.id)
    monkeypatch.setattr(dictado_api, "transcribe_clinical_audio", fake_transcriber)

    response = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/transcribir",
        headers=headers,
        files={"audio": ("dictado.webm", b"audio-bytes", "audio/webm")},
        data={"duracion_segundos": "12", "contexto": "ficha"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["transcripcion"].startswith("Paciente refiere")
    assert data["audio_conservado"] is False

    dictado = await db_session.get(DictadoClinico, UUID(data["dictado_id"]))
    assert dictado is not None
    assert dictado.estado == "transcrito"
    assert dictado.audio_size_bytes == len(b"audio-bytes")
    assert dictado.audio_conservado is False

    audit_actions = {
        row.accion
        for row in (await db_session.execute(select(AuditLog))).scalars().all()
    }
    assert "DICTADO_TRANSCRIPCION_SOLICITADA" in audit_actions
    assert "DICTADO_TRANSCRIPCION_COMPLETADA" in audit_actions


@pytest.mark.asyncio
async def test_usuario_sin_permiso_no_puede_transcribir(client: AsyncClient, db_session: AsyncSession):
    clinica, _, paciente = await clinical_context(db_session)
    headers = await auth_headers(client, db_session, rol="recepcion", clinica_id=clinica.id)

    response = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/transcribir",
        headers=headers,
        files={"audio": ("dictado.webm", b"audio-bytes", "audio/webm")},
        data={"duracion_segundos": "8"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_no_se_puede_transcribir_paciente_de_otra_clinica(client: AsyncClient, db_session: AsyncSession):
    clinica_a, _, paciente = await clinical_context(db_session)
    clinica_b = Clinica(nombre=f"Clinica Ajena {uuid4().hex[:6]}", activa=True)
    db_session.add(clinica_b)
    await db_session.commit()
    headers = await auth_headers(client, db_session, rol="doctor", clinica_id=clinica_b.id)
    assert paciente.clinica_id == clinica_a.id

    response = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/transcribir",
        headers=headers,
        files={"audio": ("dictado.webm", b"audio-bytes", "audio/webm")},
        data={"duracion_segundos": "8"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_audio_demasiado_grande_falla(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    clinica, doctor, paciente = await clinical_context(db_session)
    headers = await auth_headers(client, db_session, rol="doctor", clinica_id=clinica.id, doctor_id=doctor.id)
    monkeypatch.setenv("CLINICAL_DICTATION_MAX_AUDIO_MB", "0")
    get_settings.cache_clear()
    try:
        response = await client.post(
            f"/api/dictado/pacientes/{paciente.id}/transcribir",
            headers=headers,
            files={"audio": ("dictado.webm", b"x", "audio/webm")},
            data={"duracion_segundos": "8"},
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_proveedor_no_configurado_devuelve_error_claro(client: AsyncClient, db_session: AsyncSession):
    clinica, doctor, paciente = await clinical_context(db_session)
    headers = await auth_headers(client, db_session, rol="doctor", clinica_id=clinica.id, doctor_id=doctor.id)

    response = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/transcribir",
        headers=headers,
        files={"audio": ("dictado.webm", b"audio-bytes", "audio/webm")},
        data={"duracion_segundos": "8"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Servicio de transcripcion no configurado"
    dictado = await db_session.scalar(select(DictadoClinico).where(DictadoClinico.paciente_id == paciente.id))
    assert dictado is not None
    assert dictado.estado == "error"


@pytest.mark.asyncio
async def test_guardar_nota_crea_nota_general_y_registra_auditoria(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    import app.api.dictado as dictado_api

    clinica, doctor, paciente = await clinical_context(db_session)
    headers = await auth_headers(client, db_session, rol="doctor", clinica_id=clinica.id, doctor_id=doctor.id)
    monkeypatch.setattr(dictado_api, "transcribe_clinical_audio", fake_transcriber)

    transcribed = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/transcribir",
        headers=headers,
        files={"audio": ("dictado.webm", b"audio-bytes", "audio/webm")},
        data={"duracion_segundos": "12", "contexto": "sesion"},
    )
    dictado_id = transcribed.json()["dictado_id"]

    saved = await client.post(
        f"/api/dictado/pacientes/{paciente.id}/guardar-nota",
        headers=headers,
        json={
            "dictado_id": dictado_id,
            "texto": "Nota revisada por la doctora antes de guardar.",
        },
    )

    assert saved.status_code == 201, saved.text
    nota = await db_session.get(NotaDental, UUID(saved.json()["nota_id"]))
    assert nota is not None
    assert nota.pieza_dental is None
    assert nota.origen == "dictado_clinico"
    assert nota.texto == "Nota revisada por la doctora antes de guardar."

    dictado = await db_session.get(DictadoClinico, UUID(dictado_id))
    assert dictado is not None
    assert dictado.estado == "guardado"
    assert dictado.nota_id == nota.id
    assert dictado.audio_conservado is False

    audit = await db_session.scalar(select(AuditLog).where(AuditLog.accion == "DICTADO_NOTA_GUARDADA"))
    assert audit is not None
