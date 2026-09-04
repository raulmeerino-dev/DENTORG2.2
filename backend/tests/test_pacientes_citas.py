import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from PIL import Image as PILImage
from PIL import ImageDraw
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.backup import BackupRegistro
from app.models.cita import Cita
from app.models.clinica import Clinica
from app.models.consentimiento import Consentimiento
from app.models.doctor import Doctor
from app.models.documento import DocumentoPaciente
from app.models.factura import Cobro, Factura, FormaPago
from app.models.historial import HistorialClinico
from app.models.horario import HorarioDoctor
from app.models.paciente import Paciente
from app.models.portal_invitation import PortalInvitation
from app.models.presupuesto import Presupuesto
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario
from app.services.audit import write_audit_log
from app.services.backup_service import extraer_backup_file
from app.services.portal_invitation_service import hash_portal_token


def valid_signature_data_url() -> str:
    image = PILImage.new("RGBA", (180, 70), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    draw.line([(12, 42), (48, 25), (84, 45), (126, 20), (165, 36)], fill=(17, 24, 39, 255), width=4)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"crud-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin CRUD",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def auth_headers_for_user(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    rol: str = "recepcion",
    clinica_id=None,
    paciente_id=None,
) -> dict[str, str]:
    username = f"{rol}-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("usuario1234"),
        nombre="Usuario Clinica",
        rol=rol,
        clinica_id=clinica_id,
        paciente_id=paciente_id,
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "usuario1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_crud_paciente(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    created = await client.post(
        "/api/pacientes",
        headers=headers,
        json={
            "nombre": "Ana",
            "apellidos": "Dental",
            "dni_nie": "12345678Z",
            "telefono": "600000000",
            "telefono2": "611222333",
            "email": "ana.dental@example.com",
        },
    )
    assert created.status_code == 201
    paciente = created.json()
    assert paciente["nombre"] == "Ana"

    updated = await client.patch(
        f"/api/pacientes/{paciente['id']}",
        headers=headers,
        json={"telefono": "611111111", "observaciones": "Completar datos"},
    )
    assert updated.status_code == 200
    assert updated.json()["observaciones"] == "Completar datos"

    listed = await client.get("/api/pacientes?q=Ana", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == paciente["id"] for item in listed.json())
    summary = next(item for item in listed.json() if item["id"] == paciente["id"])
    assert summary["dni_nie"] == "12345678Z"
    assert summary["telefono2"] == "611222333"
    assert summary["email"] == "ana.dental@example.com"


@pytest.mark.asyncio
async def test_rol_paciente_no_puede_listar_pacientes(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers_for_user(client, db_session, rol="paciente")
    response = await client.get("/api/pacientes", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_paciente_no_accesible_desde_otra_clinica(client: AsyncClient, db_session: AsyncSession):
    clinica_a = Clinica(nombre="Clinica A", activa=True)
    clinica_b = Clinica(nombre="Clinica B", activa=True)
    db_session.add_all([clinica_a, clinica_b])
    await db_session.commit()

    admin_headers = await auth_headers(client, db_session)
    created = await client.post(
        "/api/pacientes",
        headers=admin_headers,
        json={"nombre": "Clara", "apellidos": "Privada", "clinica_id": str(clinica_a.id)},
    )
    assert created.status_code == 201

    other_headers = await auth_headers_for_user(client, db_session, rol="recepcion", clinica_id=clinica_b.id)
    forbidden = await client.get(f"/api/pacientes/{created.json()['id']}", headers=other_headers)
    assert forbidden.status_code == 403

    listed = await client.get("/api/pacientes?q=Clara", headers=other_headers)
    assert listed.status_code == 200
    assert listed.json() == []

    db_session.add(DocumentoPaciente(
        paciente_id=UUID(created.json()["id"]),
        nombre_original="privado.pdf",
        nombre_guardado="privado.pdf",
        ruta="pacientes/test/privado.pdf",
        mime_type="application/pdf",
        tamano_bytes=64,
        categoria="radiografia",
    ))
    await db_session.commit()

    forbidden_documents = await client.get(f"/api/pacientes/{created.json()['id']}/documentos", headers=other_headers)
    assert forbidden_documents.status_code == 403


@pytest.mark.asyncio
async def test_admin_puede_listar_auditoria(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    await write_audit_log(
        db_session,
        user=None,
        action="TEST_EVENT",
        entity_type="pacientes",
        new_values={"ok": True},
    )
    await db_session.commit()

    response = await client.get("/api/admin/auditoria", headers=headers)
    assert response.status_code == 200
    assert any(item["action"] == "TEST_EVENT" and item["entity_type"] == "pacientes" for item in response.json())


@pytest.mark.asyncio
async def test_crud_cita(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Agenda", color_agenda="#2563eb", activo=True)
    db_session.add(doctor)
    await db_session.flush()
    db_session.add(HorarioDoctor(
        doctor_id=doctor.id,
        dia_semana=0,
        tipo_dia="laborable",
        bloques=[{"inicio": "09:00", "fin": "13:00"}],
        intervalo_min=10,
    ))
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Luis", "apellidos": "Cita", "telefono": "600000001"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    next_monday = datetime.now(timezone.utc)
    while next_monday.weekday() != 0:
        next_monday += timedelta(days=1)
    fecha = next_monday.replace(hour=9, minute=0, second=0, microsecond=0)

    created = await client.post(
        "/api/citas",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha_hora": fecha.isoformat(),
            "duracion_min": 30,
            "motivo": "Revision",
        },
    )
    assert created.status_code == 201
    cita = created.json()

    solapada = await client.post(
        "/api/citas",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha_hora": fecha.isoformat(),
            "duracion_min": 30,
            "motivo": "Solapada",
        },
    )
    assert solapada.status_code == 409

    huecos = await client.get(
        "/api/citas/buscar-hueco",
        headers=headers,
        params={
            "doctor_id": str(doctor.id),
            "duracion_min": 30,
            "desde": fecha.isoformat(),
            "hasta": fecha.replace(hour=12).isoformat(),
            "max_resultados": 5,
        },
    )
    assert huecos.status_code == 200
    assert all(item["fecha_hora_inicio"] != fecha.isoformat().replace("+00:00", "Z") for item in huecos.json())

    desde_intermedio = fecha.replace(hour=10, minute=5)
    huecos_intermedios = await client.get(
        "/api/citas/buscar-hueco",
        headers=headers,
        params={
            "doctor_id": str(doctor.id),
            "duracion_min": 30,
            "desde": desde_intermedio.isoformat(),
            "hasta": fecha.replace(hour=12).isoformat(),
            "max_resultados": 5,
        },
    )
    assert huecos_intermedios.status_code == 200
    assert all(
        datetime.fromisoformat(item["fecha_hora_inicio"].replace("Z", "+00:00")) >= desde_intermedio
        for item in huecos_intermedios.json()
    )

    reminder = await client.post(
        f"/api/citas/{cita['id']}/recordatorio",
        headers=headers,
        json={"canal": "whatsapp"},
    )
    assert reminder.status_code == 200
    assert reminder.json()["estado"] == "enviado"
    assert reminder.json()["whatsappUrl"]

    disponibilidad = await client.get(
        "/api/citas/disponibilidad",
        headers=headers,
        params={"doctor_id": str(doctor.id), "desde": fecha.isoformat(), "dias": 1},
    )
    assert disponibilidad.status_code == 200
    assert disponibilidad.json()[0]["trabaja"] is True

    reprogramada = await client.patch(
        f"/api/citas/{cita['id']}/reprogramar",
        headers=headers,
        json={
            "fecha_hora": fecha.replace(hour=10).isoformat(),
            "duracion_min": 30,
            "motivo": "Paciente prefiere mas tarde",
        },
    )
    assert reprogramada.status_code == 200
    assert reprogramada.json()["fecha_hora"].startswith(fecha.replace(hour=10).isoformat().replace("+00:00", "Z")[:16])

    confirmada = await client.post(f"/api/citas/{cita['id']}/confirmar", headers=headers)
    assert confirmada.status_code == 200
    assert confirmada.json()["estado"] == "confirmada"

    cancelada = await client.post(
        f"/api/citas/{cita['id']}/cancelar",
        headers=headers,
        json={"motivo_cancelacion": "Paciente pide reprogramar", "tipo": "reprogramada", "crear_telefonear": True},
    )
    assert cancelada.status_code == 200
    assert cancelada.json()["estado"] == "anulada"

    cambios = await client.get(f"/api/citas/{cita['id']}/cambios", headers=headers)
    assert cambios.status_code == 200
    acciones = {item["accion"] for item in cambios.json()}
    assert {"crear", "reprogramar", "estado", "cancelar"} <= acciones


@pytest.mark.asyncio
async def test_cita_vincula_presupuesto_linea_y_rechaza_linea_de_otro_paciente(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Link", color_agenda="#2563eb", activo=True)
    familia = FamiliaTratamiento(nombre="Agenda link", icono="AL", orden=12, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    db_session.add(HorarioDoctor(
        doctor_id=doctor.id,
        dia_semana=0,
        tipo_dia="laborable",
        bloques=[{"inicio": "09:00", "fin": "13:00"}],
        intervalo_min=10,
    ))
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"LINK-{uuid4().hex[:6]}",
        nombre="Tratamiento con cita vinculada",
        precio=80,
        iva_porcentaje=0,
        requiere_pieza=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_a = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Alicia", "apellidos": "Linea"},
    )
    paciente_b = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Bruno", "apellidos": "Ajeno"},
    )
    assert paciente_a.status_code == 201
    assert paciente_b.status_code == 201

    presupuesto = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente_a.json()["id"],
            "doctor_id": str(doctor.id),
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "lineas": [{
                "tratamiento_id": str(tratamiento.id),
                "pieza_dental": 24,
                "caras": "MO",
                "precio_unitario": "80.00",
                "descuento_porcentaje": "0.00",
            }],
        },
    )
    assert presupuesto.status_code == 201
    linea_id = presupuesto.json()["lineas"][0]["id"]

    next_monday = datetime.now(timezone.utc)
    while next_monday.weekday() != 0:
        next_monday += timedelta(days=1)
    fecha = next_monday.replace(hour=9, minute=0, second=0, microsecond=0)

    created = await client.post(
        "/api/citas",
        headers=headers,
        json={
            "paciente_id": paciente_a.json()["id"],
            "doctor_id": str(doctor.id),
            "presupuesto_linea_id": linea_id,
            "fecha_hora": fecha.isoformat(),
            "duracion_min": 30,
            "motivo": "Tratamiento con presupuesto",
        },
    )
    assert created.status_code == 201
    assert created.json()["presupuesto_linea_id"] == linea_id

    stored = await db_session.get(Cita, UUID(created.json()["id"]))
    assert stored is not None
    assert str(stored.presupuesto_linea_id) == linea_id

    wrong_patient = await client.post(
        "/api/citas",
        headers=headers,
        json={
            "paciente_id": paciente_b.json()["id"],
            "doctor_id": str(doctor.id),
            "presupuesto_linea_id": linea_id,
            "fecha_hora": fecha.replace(hour=10).isoformat(),
            "duracion_min": 30,
            "motivo": "Linea ajena",
        },
    )
    assert wrong_patient.status_code == 409


@pytest.mark.asyncio
async def test_presupuesto_rechaza_linea_duplicada_en_mismo_presupuesto(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Duplicados", color_agenda="#0f766e", activo=True)
    familia = FamiliaTratamiento(nombre="Duplicados", icono="DU", orden=13, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"DUP-{uuid4().hex[:6]}",
        nombre="Obturacion duplicada test",
        precio=50,
        iva_porcentaje=0,
        requiere_pieza=True,
        requiere_caras=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Dalia", "apellidos": "Duplicada"},
    )
    assert paciente.status_code == 201
    presupuesto = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente.json()["id"],
            "doctor_id": str(doctor.id),
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "lineas": [{
                "tratamiento_id": str(tratamiento.id),
                "pieza_dental": 26,
                "caras": "OM",
                "precio_unitario": "50.00",
                "descuento_porcentaje": "0.00",
            }],
        },
    )
    assert presupuesto.status_code == 201

    duplicate = await client.post(
        f"/api/presupuestos/{presupuesto.json()['id']}/lineas",
        headers=headers,
        json={
            "tratamiento_id": str(tratamiento.id),
            "pieza_dental": 26,
            "caras": "OM",
            "precio_unitario": "50.00",
            "descuento_porcentaje": "0.00",
        },
    )
    assert duplicate.status_code == 409
    assert "linea activa igual" in duplicate.json()["detail"]


@pytest.mark.asyncio
async def test_portal_paciente_citas_documentos_y_firma(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dr. Portal", color_agenda="#0f89b8", activo=True)
    paciente = Paciente(nombre="Paula", apellidos="Portal")
    db_session.add_all([doctor, paciente])
    await db_session.flush()
    cita = Cita(
        paciente_id=paciente.id,
        doctor_id=doctor.id,
        fecha_hora=datetime.now(timezone.utc) + timedelta(days=3),
        duracion_min=30,
        motivo="Revision portal",
    )
    documento = DocumentoPaciente(
        paciente_id=paciente.id,
        nombre_original="informe.pdf",
        nombre_guardado="informe.pdf",
        ruta=f"pacientes/{paciente.id}/informe.pdf",
        mime_type="application/pdf",
        tamano_bytes=12,
        categoria="informe",
    )
    consentimiento = Consentimiento(
        paciente_id=paciente.id,
        tipo="Implantes",
        estado="pendiente_firma",
        fecha_firma=datetime.now(timezone.utc).date(),
        contenido="Consentimiento de prueba",
    )
    db_session.add_all([cita, documento, consentimiento])
    await db_session.commit()

    params = {"paciente_id": str(paciente.id)}
    me = await client.get("/api/portal/me", headers=headers, params=params)
    assert me.status_code == 200
    assert me.json()["resumen"]["proximas_citas"] == 1

    citas = await client.get("/api/portal/citas", headers=headers, params=params)
    assert citas.status_code == 200
    assert citas.json()[0]["motivo"] == "Revision portal"

    confirmada = await client.post(f"/api/portal/citas/{cita.id}/confirmar", headers=headers, params=params)
    assert confirmada.status_code == 200
    assert confirmada.json()["estado"] == "confirmada"

    solicitar_cambio = await client.post(
        f"/api/portal/citas/{cita.id}/solicitar-cambio",
        headers=headers,
        params=params,
        json={"motivo": "Prefiero venir por la tarde"},
    )
    assert solicitar_cambio.status_code == 200
    assert solicitar_cambio.json()["estado"] == "reschedule_requested"
    assert "Prefiero venir por la tarde" in (solicitar_cambio.json()["observaciones"] or "")

    telefonear = await client.get("/api/citas/telefonear/pendientes", headers=headers)
    assert telefonear.status_code == 200
    assert any(
        item["cita_original_id"] == str(cita.id)
        and item["motivo"] == "Solicitud de cambio desde portal"
        for item in telefonear.json()
    )

    docs = await client.get("/api/portal/documentos", headers=headers, params=params)
    assert docs.status_code == 200
    assert docs.json()[0]["nombre_original"] == "informe.pdf"

    consentimientos = await client.get("/api/portal/consentimientos", headers=headers, params=params)
    assert consentimientos.status_code == 200
    assert consentimientos.json()[0]["estado"] == "pendiente_firma"
    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.accion == "PORTAL_CONSENTIMIENTOS_LISTAR")
    )
    assert audit is not None

    firmado = await client.post(
        f"/api/portal/consentimientos/{consentimiento.id}/firmar",
        headers=headers,
        params=params,
        json={"firma_paciente_base64": valid_signature_data_url()},
    )
    assert firmado.status_code == 200
    assert firmado.json()["estado"] == "firmado"


@pytest.mark.asyncio
async def test_portal_preview_interno_restringido(client: AsyncClient, db_session: AsyncSession):
    paciente = Paciente(nombre="Paula", apellidos="Preview")
    db_session.add(paciente)
    await db_session.commit()

    auxiliar_headers = await auth_headers_for_user(client, db_session, rol="auxiliar")
    denied = await client.get(
        "/api/portal/me",
        headers=auxiliar_headers,
        params={"paciente_id": str(paciente.id)},
    )
    assert denied.status_code == 403

    recepcion_headers = await auth_headers_for_user(client, db_session, rol="recepcion")
    allowed = await client.get(
        "/api/portal/me",
        headers=recepcion_headers,
        params={"paciente_id": str(paciente.id)},
    )
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_portal_rol_paciente_solo_accede_a_su_ficha(client: AsyncClient, db_session: AsyncSession):
    paciente_propio = Paciente(nombre="Lucia", apellidos="Propia")
    paciente_ajeno = Paciente(nombre="Mario", apellidos="Ajeno")
    db_session.add_all([paciente_propio, paciente_ajeno])
    await db_session.flush()

    headers = await auth_headers_for_user(
        client,
        db_session,
        rol="paciente",
        paciente_id=paciente_propio.id,
    )

    propio = await client.get("/api/portal/me", headers=headers)
    assert propio.status_code == 200
    assert propio.json()["paciente"]["id"] == str(paciente_propio.id)

    ajeno = await client.get(
        "/api/portal/me",
        headers=headers,
        params={"paciente_id": str(paciente_ajeno.id)},
    )
    assert ajeno.status_code == 403


@pytest.mark.asyncio
async def test_portal_publico_invitacion_token_y_acceso_cruzado(client: AsyncClient, db_session: AsyncSession):
    admin_headers = await auth_headers(client, db_session)
    paciente_a = Paciente(nombre="Alba", apellidos="Token")
    paciente_b = Paciente(nombre="Bruno", apellidos="Ajeno")
    db_session.add_all([paciente_a, paciente_b])
    await db_session.flush()
    doc_b = DocumentoPaciente(
        paciente_id=paciente_b.id,
        nombre_original="ajeno.pdf",
        nombre_guardado="ajeno.pdf",
        ruta=f"pacientes/{paciente_b.id}/ajeno.pdf",
        mime_type="application/pdf",
        tamano_bytes=12,
        categoria="informe",
    )
    db_session.add(doc_b)
    await db_session.commit()

    invitation = await client.post(
        "/api/admin/portal-invitations",
        headers=admin_headers,
        json={"paciente_id": str(paciente_a.id), "expires_in_hours": 24},
    )
    assert invitation.status_code == 201
    token = invitation.json()["token"]
    assert token
    assert str(paciente_a.id) not in token

    valid = await client.post("/api/portal/public/validate", json={"token": token})
    assert valid.status_code == 200
    assert valid.json()["paciente"]["nombre"] == "Alba"

    cross_doc = await client.post(
        f"/api/portal/public/documentos/{doc_b.id}/descargar",
        json={"token": token},
    )
    assert cross_doc.status_code == 404

    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.accion == "PORTAL_PUBLIC_VALIDAR")
    )
    assert audit is not None


@pytest.mark.asyncio
async def test_portal_publico_tokens_invalidos_caducados_y_revocados(client: AsyncClient, db_session: AsyncSession):
    paciente = Paciente(nombre="Clara", apellidos="Portal")
    db_session.add(paciente)
    await db_session.flush()
    expired_token = "expired-" + uuid4().hex + uuid4().hex
    revoked_token = "revoked-" + uuid4().hex + uuid4().hex
    db_session.add_all([
        PortalInvitation(
            paciente_id=paciente.id,
            clinica_id=paciente.clinica_id,
            token_hash=hash_portal_token(expired_token),
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            estado="activa",
        ),
        PortalInvitation(
            paciente_id=paciente.id,
            clinica_id=paciente.clinica_id,
            token_hash=hash_portal_token(revoked_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            estado="revocada",
            revoked_at=datetime.now(timezone.utc),
        ),
    ])
    await db_session.commit()

    invalid = await client.post("/api/portal/public/validate", json={"token": "invalid-" + uuid4().hex + uuid4().hex})
    assert invalid.status_code == 404
    assert invalid.json()["detail"]["code"] == "invalid"

    expired = await client.post("/api/portal/public/validate", json={"token": expired_token})
    assert expired.status_code == 410
    assert expired.json()["detail"]["code"] == "expired"

    revoked = await client.post("/api/portal/public/validate", json={"token": revoked_token})
    assert revoked.status_code == 410
    assert revoked.json()["detail"]["code"] == "revoked"


@pytest.mark.asyncio
async def test_portal_paciente_no_modifica_citas_ajenas_pasadas_o_cerradas(
    client: AsyncClient,
    db_session: AsyncSession,
):
    doctor = Doctor(nombre="Dra. Portal Seguridad", color_agenda="#0f89b8", activo=True)
    paciente_propio = Paciente(nombre="Laura", apellidos="Portal")
    paciente_ajeno = Paciente(nombre="Pablo", apellidos="Ajeno")
    db_session.add_all([doctor, paciente_propio, paciente_ajeno])
    await db_session.flush()

    cita_pasada = Cita(
        paciente_id=paciente_propio.id,
        doctor_id=doctor.id,
        fecha_hora=datetime.now(timezone.utc) - timedelta(days=1),
        duracion_min=30,
        motivo="Revision pasada",
    )
    cita_cerrada = Cita(
        paciente_id=paciente_propio.id,
        doctor_id=doctor.id,
        fecha_hora=datetime.now(timezone.utc) + timedelta(days=2),
        duracion_min=30,
        estado="atendida",
        motivo="Tratamiento cerrado",
    )
    cita_ajena = Cita(
        paciente_id=paciente_ajeno.id,
        doctor_id=doctor.id,
        fecha_hora=datetime.now(timezone.utc) + timedelta(days=3),
        duracion_min=30,
        motivo="Cita ajena",
    )
    db_session.add_all([cita_pasada, cita_cerrada, cita_ajena])
    await db_session.commit()

    headers = await auth_headers_for_user(
        client,
        db_session,
        rol="paciente",
        paciente_id=paciente_propio.id,
    )

    citas = await client.get("/api/portal/citas", headers=headers)
    assert citas.status_code == 200
    assert citas.json() == []

    confirmar_pasada = await client.post(f"/api/portal/citas/{cita_pasada.id}/confirmar", headers=headers)
    assert confirmar_pasada.status_code == 409

    cambiar_pasada = await client.post(
        f"/api/portal/citas/{cita_pasada.id}/solicitar-cambio",
        headers=headers,
        json={"motivo": "Necesito otra fecha"},
    )
    assert cambiar_pasada.status_code == 409

    cancelar_cerrada = await client.post(
        f"/api/portal/citas/{cita_cerrada.id}/cancelar",
        headers=headers,
        json={"motivo_cancelacion": "No puedo asistir", "tipo": "anulacion_paciente"},
    )
    assert cancelar_cerrada.status_code == 409

    cambiar_cerrada = await client.post(
        f"/api/portal/citas/{cita_cerrada.id}/solicitar-cambio",
        headers=headers,
        json={"motivo": "Necesito otra fecha"},
    )
    assert cambiar_cerrada.status_code == 409

    confirmar_ajena = await client.post(f"/api/portal/citas/{cita_ajena.id}/confirmar", headers=headers)
    assert confirmar_ajena.status_code == 404

    cambiar_ajena = await client.post(
        f"/api/portal/citas/{cita_ajena.id}/solicitar-cambio",
        headers=headers,
        json={"motivo": "Necesito otra fecha"},
    )
    assert cambiar_ajena.status_code == 404


@pytest.mark.asyncio
async def test_documento_paciente_baja_logica_y_oculto(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    paciente = Paciente(nombre="Diana", apellidos="Documental")
    db_session.add(paciente)
    await db_session.flush()
    documento = DocumentoPaciente(
        paciente_id=paciente.id,
        nombre_original="informe.pdf",
        nombre_guardado="informe.pdf",
        ruta=f"pacientes/{paciente.id}/informe.pdf",
        mime_type="application/pdf",
        tamano_bytes=12,
        categoria="informe",
    )
    db_session.add(documento)
    await db_session.commit()

    deleted = await client.delete(
        f"/api/pacientes/{paciente.id}/documentos/{documento.id}",
        headers=headers,
        params={"motivo": "Duplicado"},
    )
    assert deleted.status_code == 204
    await db_session.refresh(documento)
    assert documento.deleted_at is not None
    assert documento.delete_reason == "Duplicado"

    listado = await client.get(f"/api/pacientes/{paciente.id}/documentos", headers=headers)
    assert listado.status_code == 200
    assert listado.json() == []

    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.accion == "DOCUMENTO_BAJA_LOGICA")
    )
    assert audit is not None


@pytest.mark.asyncio
async def test_inventario_registra_movimientos(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    created = await client.post(
        "/api/inventario",
        headers=headers,
        json={"nombre": "Anestesia carpules", "stock_min": 5, "stock_act": 10},
    )
    assert created.status_code == 201
    producto_id = created.json()["id"]

    salida = await client.post(
        f"/api/inventario/{producto_id}/movimientos",
        headers=headers,
        json={"tipo": "salida", "cantidad": 3, "motivo": "Reposicion gabinete"},
    )
    assert salida.status_code == 201
    assert salida.json()["stock_act"] == 7

    movimientos = await client.get(f"/api/inventario/{producto_id}/movimientos", headers=headers)
    assert movimientos.status_code == 200
    assert movimientos.json()[0]["stock_resultante"] == 7

    exceso = await client.post(
        f"/api/inventario/{producto_id}/movimientos",
        headers=headers,
        json={"tipo": "salida", "cantidad": 99},
    )
    assert exceso.status_code == 409


@pytest.mark.asyncio
async def test_inventario_proveedores_pedidos_y_alertas(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    proveedor_res = await client.post(
        "/api/inventario/proveedores",
        headers=headers,
        json={"nombre": "Dental Supply", "contacto": "Laura", "telefono": "600123123"},
    )
    assert proveedor_res.status_code == 201
    proveedor_id = proveedor_res.json()["id"]

    producto_res = await client.post(
        "/api/inventario",
        headers=headers,
        json={
            "nombre": "Composite A2",
            "categoria": "Conservadora",
            "stock_min": 5,
            "stock_act": 2,
            "unidad": "jeringa",
            "coste_unitario": "9.50",
            "proveedor_id": proveedor_id,
        },
    )
    assert producto_res.status_code == 201
    producto_id = producto_res.json()["id"]

    alertas = await client.get("/api/inventario/alertas-stock", headers=headers)
    assert alertas.status_code == 200
    assert any(item["id"] == producto_id for item in alertas.json())

    pedido_res = await client.post(
        "/api/inventario/pedidos",
        headers=headers,
        json={
            "proveedor_id": proveedor_id,
            "notas": "Reposicion semanal",
            "lineas": [{"producto_id": producto_id, "cantidad": 8, "coste_unitario": "9.25"}],
        },
    )
    assert pedido_res.status_code == 201
    pedido = pedido_res.json()
    assert pedido["estado"] == "borrador"
    assert pedido["lineas"][0]["cantidad"] == 8

    enviado = await client.patch(
        f"/api/inventario/pedidos/{pedido['id']}",
        headers=headers,
        json={"estado": "enviado"},
    )
    assert enviado.status_code == 200
    assert enviado.json()["estado"] == "enviado"

    recibido = await client.post(f"/api/inventario/pedidos/{pedido['id']}/recibir", headers=headers)
    assert recibido.status_code == 200
    assert recibido.json()["estado"] == "recibido"

    productos = await client.get("/api/inventario", headers=headers)
    assert productos.status_code == 200
    actualizado = next(item for item in productos.json() if item["id"] == producto_id)
    assert actualizado["stock_act"] == 10

    movimientos = await client.get(f"/api/inventario/{producto_id}/movimientos", headers=headers)
    assert movimientos.status_code == 200
    assert movimientos.json()[0]["referencia_tipo"] == "pedido_proveedor"


@pytest.mark.asyncio
async def test_consentimiento_versionado_firma_pdf_y_revocacion(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Pilar", "apellidos": "Firma", "telefono": "600000003"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    plantilla_res = await client.post(
        "/api/consentimientos/plantillas",
        headers=headers,
        json={
            "codigo": "endo-test",
            "nombre": "Endodoncia test",
            "tipo_tratamiento": "endodoncia",
            "contenido": "D./Dña. {{paciente_nombre}} autoriza endodoncia en fecha {{fecha}}.",
        },
    )
    assert plantilla_res.status_code == 201
    plantilla = plantilla_res.json()

    creado = await client.post(
        f"/api/pacientes/{paciente_id}/consentimientos",
        headers=headers,
        json={"tipo": "Endodoncia test", "plantilla_id": plantilla["id"]},
    )
    assert creado.status_code == 201
    consentimiento = creado.json()
    assert consentimiento["estado"] == "pendiente_firma"
    assert consentimiento["version_plantilla"] == plantilla["version_num"]
    assert "Pilar Firma" in consentimiento["contenido"]

    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAABGCAYAAABll74gAAACC0lEQVR4nO3cQW6DMBRFUegSPOsOuv/VdAedZQtUkRoJZZDGYPP/e/+eSdRJCvaVaxB03bZtAVx8RB8AMBJBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBwwpBF9Q+v7b9p5OVdwrraC8Cvv18r4sBgi6idazGynETtLl2YluhGDZBFw359hfru8GrxC0d9H0y7gP9+Iw+HrWYn70Td/Zxlgx6P/CPoPc/L0W1gyH3fk/v911JKugqFzZRITus2hJBH72wyTTQijErhp066J7JqnCPNSJktbjTBX12sNzDjgxZIew0QY8cnEyTPlLm82pJ4g4PeuZAZA7A9TxacNhhQV85SarbEKWQs9z6uzzorBczmeKIXuWUz+eyoDOtNpnDzjROiqv29KCzTlC248p2PKqr9rSgVSYo+jijf3+00X8thwatvPeL2IZUj/nZiGdyhgStHHJE2IT82pmnJ08F7RTyFWET8nyHgq4yMSPPs8qYSQVddVLOnHfVMZMOusqk9GxDCFlky8HbIf+HTcxiQTMhx148YNzmC3/aTp3znR5FBD1I9euLLAh6UtiEHIOgYYX/PgorBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBA0rBI3FyS+87qjITRiDtAAAAABJRU5ErkJggg=="
    firmado = await client.post(
        f"/api/consentimientos/{consentimiento['id']}/firmar",
        headers=headers,
        json={"firma_paciente_base64": tiny_png},
    )
    assert firmado.status_code == 200
    firmado_json = firmado.json()
    assert firmado_json["estado"] == "firmado"
    assert firmado_json["documento_id"]
    assert firmado_json["hash_documento"]

    bloqueado = await client.patch(
        f"/api/pacientes/{paciente_id}/consentimientos/{consentimiento['id']}",
        headers=headers,
        json={"contenido": "cambio no permitido"},
    )
    assert bloqueado.status_code == 409

    pdf = await client.get(f"/api/consentimientos/{consentimiento['id']}/pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")

    revocado = await client.post(
        f"/api/consentimientos/{consentimiento['id']}/revocar",
        headers=headers,
        json={"motivo": "Paciente solicita revocacion"},
    )
    assert revocado.status_code == 200
    assert revocado.json()["estado"] == "revocado"


@pytest.mark.asyncio
async def test_tratamiento_historial_y_presupuesto(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dr. Clinico", color_agenda="#16a34a", activo=True)
    familia = FamiliaTratamiento(nombre="Conservadora", icono="OC", orden=1, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"EMP-{uuid4().hex[:6]}",
        nombre="Empaste test",
        precio=50,
        iva_porcentaje=0,
        requiere_pieza=True,
        requiere_caras=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Mar", "apellidos": "Historia", "telefono": "600000002"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    historial = await client.post(
        "/api/tratamientos/historial",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "tratamiento_id": str(tratamiento.id),
            "doctor_id": str(doctor.id),
            "pieza_dental": 24,
            "caras": "MO",
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "procedimiento": "Obturacion pieza 24",
            "estado": "realizado",
            "importe": "50.00",
        },
    )
    assert historial.status_code == 201
    assert historial.json()["pieza_dental"] == 24

    filtered = await client.get(f"/api/tratamientos/historial/{paciente_id}?pieza=24", headers=headers)
    assert filtered.status_code == 200
    assert filtered.json()[0]["tratamiento"]["nombre"] == "Empaste test"

    presupuesto = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "lineas": [{
                "tratamiento_id": str(tratamiento.id),
                "pieza_dental": 24,
                "caras": "MO",
                "precio_unitario": "50.00",
                "descuento_porcentaje": "0.00",
            }],
        },
    )
    assert presupuesto.status_code == 201
    assert float(presupuesto.json()["total"]) == 50.0

    nota = await client.post(
        "/api/tratamientos/notas-dentales",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "pieza_dental": 24,
            "caras": "MO",
            "texto": "Sensibilidad al frio en mesial",
        },
    )
    assert nota.status_code == 201
    assert nota.json()["texto"] == "Sensibilidad al frio en mesial"
    assert nota.json()["pieza_dental"] == 24

    notas = await client.get(f"/api/tratamientos/notas-dentales/{paciente_id}?pieza=24", headers=headers)
    assert notas.status_code == 200
    assert notas.json()[0]["texto"] == "Sensibilidad al frio en mesial"


@pytest.mark.asyncio
async def test_sesion_realizada_desde_presupuesto_cierra_pendiente(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Sesion", color_agenda="#0891b2", activo=True)
    familia = FamiliaTratamiento(nombre="Endodoncia", icono="EN", orden=3, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"END-{uuid4().hex[:6]}",
        nombre="Endodoncia test",
        precio=120,
        iva_porcentaje=0,
        requiere_pieza=True,
        requiere_caras=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Nora", "apellidos": "Sesion", "telefono": "600000003"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    presupuesto = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "lineas": [{
                "tratamiento_id": str(tratamiento.id),
                "pieza_dental": 36,
                "caras": "O",
                "precio_unitario": "120.00",
                "descuento_porcentaje": "0.00",
            }],
        },
    )
    assert presupuesto.status_code == 201
    presupuesto_id = presupuesto.json()["id"]
    linea_id = presupuesto.json()["lineas"][0]["id"]

    aceptado = await client.post(
        f"/api/presupuestos/{presupuesto_id}/aceptar",
        headers=headers,
        json={"pasar_a_trabajo_pendiente": True},
    )
    assert aceptado.status_code == 200

    pendientes = await client.get(f"/api/presupuestos/trabajo-pendiente/{paciente_id}", headers=headers)
    assert pendientes.status_code == 200
    pendiente = next(item for item in pendientes.json() if item["presupuesto_linea_id"] == linea_id)
    assert pendiente["presupuesto_linea"]["id"] == linea_id
    assert pendiente["presupuesto_linea"]["tratamiento"]["nombre"] == tratamiento.nombre

    realizado = await client.post(
        "/api/tratamientos/historial/sesion-realizada",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "tratamiento_id": str(tratamiento.id),
            "doctor_id": str(doctor.id),
            "presupuesto_linea_id": linea_id,
            "pieza_dental": 36,
            "caras": "O",
            "procedimiento": "Endodoncia pieza 36",
            "observaciones": "Conductometria y obturacion realizadas",
            "origen": "presupuesto_linea",
        },
    )
    assert realizado.status_code == 201
    assert realizado.json()["presupuesto_linea_id"] == linea_id
    assert realizado.json()["observaciones"] == "Conductometria y obturacion realizadas"

    pendientes_cerrados = await client.get(f"/api/presupuestos/trabajo-pendiente/{paciente_id}", headers=headers)
    assert pendientes_cerrados.status_code == 200
    assert all(item["presupuesto_linea_id"] != linea_id for item in pendientes_cerrados.json())

    historial = await client.get(f"/api/tratamientos/historial/{paciente_id}?pieza=36", headers=headers)
    assert historial.status_code == 200
    assert historial.json()[0]["presupuesto_linea_id"] == linea_id


@pytest.mark.asyncio
async def test_sesion_realizada_crea_pieza_nueva_en_odontograma_existente(client: AsyncClient, db_session: AsyncSession):
    """Regresion: si el paciente ya tiene un odontograma activo pero la pieza no existe,
    finalizar la sesion creaba MissingGreenlet al acceder a piece.superficies sobre la
    nueva OdontogramaPieza (relacion lazy en contexto async)."""
    from app.models.odontograma import Odontograma, OdontogramaPieza, OdontogramaSuperficie

    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Greenlet", color_agenda="#0f766e", activo=True)
    familia = FamiliaTratamiento(nombre="Operatoria", icono="OP", orden=4, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"OP-{uuid4().hex[:6]}",
        nombre="Obturacion compuesta",
        precio=60,
        iva_porcentaje=0,
        requiere_pieza=True,
        requiere_caras=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Greta", "apellidos": "Greenlet", "telefono": "600000010"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    # Odontograma activo con pieza 24 pero SIN pieza 15 (la pieza objetivo del test).
    odo = Odontograma(paciente_id=UUID(paciente_id), activo=True, version=1)
    db_session.add(odo)
    await db_session.flush()
    pieza_existente = OdontogramaPieza(odontograma_id=odo.id, pieza_fdi=24, superficies=[])
    db_session.add(pieza_existente)
    await db_session.flush()
    db_session.add(OdontogramaSuperficie(pieza_id=pieza_existente.id, superficie="oclusal_incisal", condicion="sano"))
    await db_session.commit()

    realizado = await client.post(
        "/api/tratamientos/historial/sesion-realizada",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "tratamiento_id": str(tratamiento.id),
            "doctor_id": str(doctor.id),
            "pieza_dental": 15,
            "caras": "OD",
            "procedimiento": "Obturacion en pieza nueva",
            "observaciones": "Regression test",
            "origen": "manual",
        },
    )
    assert realizado.status_code == 201, realizado.text
    assert realizado.json()["pieza_dental"] == 15
    assert realizado.json()["caras"] == "OD"


@pytest.mark.asyncio
async def test_presupuesto_aceptado_se_factura_y_se_paga(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Factura", color_agenda="#0f766e", activo=True)
    familia = FamiliaTratamiento(nombre="Protesis", icono="PR", orden=2, activo=True)
    forma_pago = FormaPago(nombre=f"Tarjeta test {uuid4().hex[:6]}", activo=True)
    db_session.add_all([doctor, familia, forma_pago])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"COR-{uuid4().hex[:6]}",
        nombre="Corona zirconio test",
        precio=390,
        iva_porcentaje=0,
        requiere_pieza=True,
        activo=True,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Pablo", "apellidos": "Factura", "telefono": "600000004"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    presupuesto_res = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "lineas": [{
                "tratamiento_id": str(tratamiento.id),
                "pieza_dental": 11,
                "precio_unitario": "390.00",
                "descuento_porcentaje": "0.00",
            }],
        },
    )
    assert presupuesto_res.status_code == 201
    presupuesto_id = presupuesto_res.json()["id"]

    presentado = await client.post(f"/api/presupuestos/{presupuesto_id}/presentar", headers=headers)
    assert presentado.status_code == 200
    assert presentado.json()["estado"] == "presentado"

    aceptado = await client.post(
        f"/api/presupuestos/{presupuesto_id}/aceptar",
        headers=headers,
        json={"pasar_a_trabajo_pendiente": True},
    )
    assert aceptado.status_code == 200
    assert aceptado.json()["estado"] == "aceptado"
    assert aceptado.json()["lineas"][0]["aceptado"] is True

    factura_res = await client.post(
        f"/api/presupuestos/{presupuesto_id}/convertir-a-factura",
        headers=headers,
        json={
            "serie": "A",
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "forma_pago_id": str(forma_pago.id),
            "solo_aceptadas": True,
        },
    )
    assert factura_res.status_code == 201
    factura = factura_res.json()
    assert factura["estado"] == "emitida"
    assert factura["huella"]
    assert float(factura["total"]) == 390.0

    presupuesto_facturado = await client.get(f"/api/presupuestos/{presupuesto_id}", headers=headers)
    assert presupuesto_facturado.status_code == 200
    assert presupuesto_facturado.json()["estado"] == "facturado"

    factura_duplicada = await client.post(
        f"/api/presupuestos/{presupuesto_id}/convertir-a-factura",
        headers=headers,
        json={
            "serie": "A",
            "fecha": datetime.now(timezone.utc).date().isoformat(),
            "forma_pago_id": str(forma_pago.id),
            "solo_aceptadas": True,
        },
    )
    assert factura_duplicada.status_code == 409

    cobro_excesivo = await client.post(
        f"/api/facturas/{factura['id']}/pagos",
        headers=headers,
        json={"importe": "400.00", "forma_pago_id": str(forma_pago.id), "notas": "Cobro excesivo"},
    )
    assert cobro_excesivo.status_code == 409

    pago = await client.post(
        f"/api/facturas/{factura['id']}/pagos",
        headers=headers,
        json={"forma_pago_id": str(forma_pago.id), "importe": "390.00"},
    )
    assert pago.status_code == 201
    assert pago.json()["estado"] == "pagada"

    cobro_factura_pagada = await client.post(
        f"/api/facturas/{factura['id']}/pagos",
        headers=headers,
        json={"importe": "1.00", "forma_pago_id": str(forma_pago.id), "notas": "Cobro tras pago completo"},
    )
    assert cobro_factura_pagada.status_code == 409

    saldo = await client.get(f"/api/pacientes/{paciente_id}/saldo", headers=headers)
    assert saldo.status_code == 200
    assert float(saldo.json()["pendiente"]) == 0.0
    assert saldo.json()["facturas_pendientes"] == 0


@pytest.mark.asyncio
async def test_dashboard_bi_agrega_datos_clinicos_y_economicos(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    today = datetime.now(timezone.utc).date()
    usuario = Usuario(
        username=f"bi-caja-{uuid4().hex[:8]}",
        password_hash=hash_password("usuario1234"),
        nombre="Caja BI",
        rol="recepcion",
        activo=True,
    )
    doctor = Doctor(nombre="Dra. BI", color_agenda="#2563eb", activo=True)
    familia = FamiliaTratamiento(nombre="BI", icono="BI", orden=9, activo=True)
    forma_pago = FormaPago(nombre=f"Efectivo BI {uuid4().hex[:6]}", activo=True)
    paciente = Paciente(nombre="Eva", apellidos="Dashboard", activo=True)
    db_session.add_all([usuario, doctor, familia, forma_pago, paciente])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"BI-{uuid4().hex[:6]}",
        nombre="Tratamiento BI",
        precio=100,
        iva_porcentaje=0,
        activo=True,
    )
    factura = Factura(
        paciente_id=paciente.id,
        serie="BI",
        numero=int(uuid4().int % 100000),
        fecha=today,
        tipo="paciente",
        subtotal=Decimal("100.00"),
        iva_total=Decimal("0.00"),
        total=Decimal("100.00"),
        estado="emitida",
        forma_pago_id=forma_pago.id,
    )
    db_session.add_all([tratamiento, factura])
    await db_session.flush()
    db_session.add_all([
        Cobro(
            factura_id=factura.id,
            fecha=datetime.now(timezone.utc),
            importe=Decimal("40.00"),
            forma_pago_id=forma_pago.id,
            usuario_id=usuario.id,
        ),
        Cita(
            paciente_id=paciente.id,
            doctor_id=doctor.id,
            fecha_hora=datetime.now(timezone.utc),
            duracion_min=30,
            estado="atendida",
            motivo="BI",
        ),
        HistorialClinico(
            paciente_id=paciente.id,
            tratamiento_id=tratamiento.id,
            doctor_id=doctor.id,
            fecha=today,
            estado="realizado",
            importe=Decimal("100.00"),
        ),
        Presupuesto(
            paciente_id=paciente.id,
            doctor_id=doctor.id,
            numero=int(uuid4().int % 1000000) + 100000,
            fecha=today,
            estado="aceptado",
        ),
    ])
    await db_session.commit()

    response = await client.get("/api/reportes/dashboard", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["kpis"]["facturacion"]["total_facturado"] >= 100
    assert data["kpis"]["facturacion"]["total_cobrado"] >= 40
    assert data["kpis"]["citas"]["asistencia"] >= 1
    assert any(row["doctor"] == "Dra. BI" for row in data["doctores"])
    assert any(row["tratamiento"] == "Tratamiento BI" for row in data["tratamientos"])
    assert any(row["id"] == str(paciente.id) and row["saldo_pendiente"] >= 60 for row in data["pacientes_deuda"])


@pytest.mark.asyncio
async def test_backup_cifrado_y_verificable(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    created = await client.post("/api/admin/backups", headers=headers)
    assert created.status_code == 201
    backup = created.json()
    assert backup["estado"] == "correcto"
    assert backup["cifrado"] is True
    assert backup["hash_sha256"]
    assert backup["alcance"] == "full"
    assert backup["incluye_bd"] is True
    assert backup["incluye_uploads"] is True

    denied_headers = await auth_headers_for_user(client, db_session, rol="recepcion")
    denied = await client.post("/api/admin/backups", headers=denied_headers)
    assert denied.status_code == 403

    verified = await client.get(f"/api/admin/backups/{backup['id']}/verificar", headers=headers)
    assert verified.status_code == 200
    assert verified.json()["ok"] is True
    assert "uploads" in verified.json()

    restore_test = await client.get(
        f"/api/admin/backups/{backup['id']}/simular-restauracion",
        headers=headers,
    )
    assert restore_test.status_code == 200
    assert restore_test.json()["ok"] is True
    assert restore_test.json()["dry_run"] is True

    restore_proof = await client.post(
        f"/api/admin/backups/{backup['id']}/registrar-prueba-restauracion",
        headers=headers,
        json={"resultado": "ok", "notas": "Restaurado en entorno de prueba"},
    )
    assert restore_proof.status_code == 200
    assert restore_proof.json()["estado"] == "restauracion_probada"
    assert restore_proof.json()["restauracion_resultado"] == "ok"

    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.accion == "BACKUP_VERIFICAR")
    )
    assert audit is not None


@pytest.mark.asyncio
async def test_backup_copia_externa_y_extraccion_offline(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    import app.api.admin as admin_api

    old_admin_settings = admin_api.settings
    external_dir = tmp_path / "custodia-externa"
    restore_dir = tmp_path / "restore-kit"
    monkeypatch.setenv("BACKUP_EXTERNAL_COPY_DIR", str(external_dir))
    monkeypatch.setenv("BACKUP_EXTERNAL_LOCATION", "NAS test cifrado")
    get_settings.cache_clear()
    admin_api.settings = get_settings()

    try:
        headers = await auth_headers(client, db_session)
        created = await client.post("/api/admin/backups", headers=headers)
        assert created.status_code == 201
        backup = created.json()
        assert backup["ubicacion"] == "local+external"
        assert backup["destino_externo"] == "NAS test cifrado"

        copied_files = list(external_dir.glob("*.dentcorebak"))
        assert len(copied_files) == 1
        copied_hash = copied_files[0].read_bytes()
        import hashlib

        assert hashlib.sha256(copied_hash).hexdigest() == backup["hash_sha256"]

        registro = await db_session.get(BackupRegistro, UUID(backup["id"]))
        assert registro and registro.ruta
        extracted = extraer_backup_file(Path(registro.ruta), restore_dir, backup["hash_sha256"])
        assert extracted["ok"] is True
        assert (restore_dir / "database.json").exists()
        assert (restore_dir / "restore-summary.json").exists()

        preflight = await client.get("/api/admin/produccion/preflight", headers=headers)
        assert preflight.status_code == 200
        checks = preflight.json()["checks"]
        assert any(
            check["status"] == "ok" and check["titulo"] == "Copia externa verificada"
            for check in checks
        )
    finally:
        admin_api.settings = old_admin_settings
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_preflight_falla_si_no_hay_backup_reciente(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    await db_session.execute(delete(BackupRegistro))
    await db_session.commit()

    preflight = await client.get("/api/admin/produccion/preflight", headers=headers)
    assert preflight.status_code == 200
    checks = preflight.json()["checks"]
    assert any(
        check["status"] == "fail" and check["titulo"] == "Sin backups registrados"
        for check in checks
    )
