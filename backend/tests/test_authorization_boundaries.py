from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.core.security import create_access_token
from app.database import get_db
from app.domains.billing.persistence.factura import Factura
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.clinical.persistence.receta import RecetaPlantilla
from app.domains.clinical.persistence.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.laboratory.persistence.laboratorio import Laboratorio, TrabajoLaboratorio
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita, CitaTelefonear
from app.main import app


def bearer_headers(
    role: str,
    *,
    clinic_id: UUID | None = None,
    patient_id: UUID | None = None,
    user_id: UUID | None = None,
) -> dict[str, str]:
    claims = {
        "sub": str(user_id or uuid4()),
        "username": f"authz-{role}-{uuid4().hex[:8]}",
        "rol": role,
        "clinica_id": str(clinic_id) if clinic_id else None,
        "paciente_id": str(patient_id) if patient_id else None,
    }
    return {"Authorization": f"Bearer {create_access_token(claims)}"}


async def persisted_bearer_headers(db, role, clinic_id=None):
    user = Usuario(username=f"authz-live-{uuid4().hex}", password_hash="not-used", nombre="Authz test", rol=role, clinica_id=clinic_id, activo=True)
    db.add(user)
    await db.commit()
    return bearer_headers(role, clinic_id=clinic_id, user_id=user.id)


@pytest_asyncio.fixture
async def boundary_client() -> AsyncClient:
    async def override_get_db():
        yield object()

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/assistant/llm-health"),
        ("GET", "/api/pacientes"),
        ("GET", "/api/citas"),
        ("GET", "/api/doctores"),
        ("GET", "/api/tratamientos/familias"),
        ("GET", "/api/presupuestos"),
        ("GET", "/api/facturas"),
        ("GET", "/api/fichajes/trabajadores"),
        ("GET", "/api/reportes/dashboard"),
        ("GET", "/api/admin/usuarios"),
        ("GET", f"/api/pdf/presupuestos/{uuid4()}"),
        ("GET", f"/api/pacientes/{uuid4()}/documentos"),
        ("POST", f"/api/dictado/pacientes/{uuid4()}/transcribir"),
        ("GET", "/api/laboratorios"),
        ("GET", "/api/notificaciones/mias"),
        ("GET", "/api/consentimientos/plantillas"),
        ("GET", "/api/recetas/provider-status"),
        ("GET", f"/api/pacientes/{uuid4()}/odontograma"),
        ("GET", "/api/clinicas"),
        ("GET", "/api/inventario/alertas-stock"),
        ("POST", "/api/sync"),
        ("POST", "/api/import/pacientes"),
        ("GET", "/api/whatsapp/comunicaciones"),
        ("POST", f"/api/whatsapp/comunicaciones/{uuid4()}/accion"),
        ("POST", f"/api/whatsapp/comunicaciones/{uuid4()}/reprogramar"),
    ],
)
async def test_patient_role_is_blocked_from_internal_apis(
    boundary_client: AsyncClient,
    method: str,
    path: str,
) -> None:
    response = await boundary_client.request(
        method,
        path,
        headers=bearer_headers("paciente"),
        json={} if method != "GET" else None,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "doctor", "recepcion", "auxiliar"])
async def test_staff_roles_keep_access_to_patient_workspace(
    client: AsyncClient,
    role: str,
) -> None:
    response = await client.get(
        "/api/pacientes?limit=1",
        headers=bearer_headers(role),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["doctor", "auxiliar", "paciente"])
@pytest.mark.parametrize(
    "path",
    [
        "/api/facturas",
        "/api/reportes/dashboard",
        "/api/reportes/ingresos?desde=2026-01-01&hasta=2026-01-31",
        f"/api/pdf/facturas/{uuid4()}",
        f"/api/pdf/cobros/{uuid4()}",
    ],
)
async def test_non_billing_roles_cannot_access_financial_apis(
    boundary_client: AsyncClient,
    role: str,
    path: str,
) -> None:
    response = await boundary_client.get(path, headers=bearer_headers(role))
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["doctor", "auxiliar", "paciente"])
@pytest.mark.parametrize("operation", ["cobros", "pagos"])
async def test_non_billing_roles_cannot_register_payments(
    boundary_client: AsyncClient,
    role: str,
    operation: str,
) -> None:
    response = await boundary_client.post(
        f"/api/facturas/{uuid4()}/{operation}",
        headers=bearer_headers(role),
        json={"forma_pago_id": str(uuid4()), "importe": "10.00"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "recepcion"])
@pytest.mark.parametrize("operation", ["cobros", "pagos"])
async def test_billing_roles_reach_payment_resource_lookup(
    client: AsyncClient,
    db_session: AsyncSession,
    role: str,
    operation: str,
) -> None:
    response = await client.post(
        f"/api/facturas/{uuid4()}/{operation}",
        headers=await persisted_bearer_headers(db_session, role),
        json={"forma_pago_id": str(uuid4()), "importe": "10.00"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["doctor", "recepcion", "auxiliar", "paciente"])
async def test_non_admin_roles_cannot_access_inventory(
    boundary_client: AsyncClient,
    role: str,
) -> None:
    response = await boundary_client.get(
        "/api/inventario",
        headers=bearer_headers(role),
    )
    assert response.status_code == 403


def test_unassigned_staff_scope_is_fail_closed() -> None:
    user = TokenData(
        user_id=uuid4(),
        username="recepcion-sin-clinica",
        rol="recepcion",
    )
    clinic_id = uuid4()

    ensure_clinic_access(user, None)
    with pytest.raises(HTTPException) as direct_error:
        ensure_clinic_access(user, clinic_id)
    with pytest.raises(HTTPException) as assignment_error:
        resolve_clinic_id(user, clinic_id)

    scoped = scope_select_by_clinic(select(Paciente), Paciente, user)
    assert direct_error.value.status_code == 403
    assert assignment_error.value.status_code == 403
    assert "pacientes.clinica_id IS NULL" in str(scoped)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "recepcion"])
async def test_billing_roles_keep_financial_read_access(
    client: AsyncClient,
    role: str,
) -> None:
    headers = bearer_headers(role)
    invoices = await client.get("/api/facturas", headers=headers)
    income = await client.get(
        "/api/reportes/ingresos",
        headers=headers,
        params={"desde": date.today().isoformat(), "hasta": date.today().isoformat()},
    )

    assert invoices.status_code == 200
    assert income.status_code == 200


@pytest.mark.asyncio
async def test_patient_role_keeps_access_to_own_portal(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    patient = Paciente(nombre="Portal", apellidos=f"Propio {uuid4().hex[:8]}")
    db_session.add(patient)
    await db_session.commit()

    response = await client.get(
        "/api/portal/me",
        headers=bearer_headers("paciente", patient_id=patient.id),
    )

    assert response.status_code == 200
    assert response.json()["paciente"]["id"] == str(patient.id)


@pytest.mark.asyncio
async def test_assigned_staff_cannot_cross_clinics(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    clinic_a = Clinica(nombre=f"Clinica A {uuid4().hex[:8]}", activa=True)
    clinic_b = Clinica(nombre=f"Clinica B {uuid4().hex[:8]}", activa=True)
    db_session.add_all([clinic_a, clinic_b])
    await db_session.flush()
    patient_a = Paciente(
        nombre="Paciente",
        apellidos=f"Clinica A {uuid4().hex[:8]}",
        clinica_id=clinic_a.id,
    )
    patient_b = Paciente(
        nombre="Paciente",
        apellidos=f"Clinica B {uuid4().hex[:8]}",
        clinica_id=clinic_b.id,
    )
    db_session.add_all([patient_a, patient_b])
    await db_session.commit()

    headers = await persisted_bearer_headers(db_session, "recepcion", clinic_a.id)
    listed = await client.get("/api/pacientes?limit=200", headers=headers)
    own = await client.get(f"/api/pacientes/{patient_a.id}", headers=headers)
    foreign = await client.get(f"/api/pacientes/{patient_b.id}", headers=headers)
    create_foreign = await client.post(
        "/api/pacientes",
        headers=headers,
        json={
            "nombre": "No",
            "apellidos": "Cruzar clinica",
            "clinica_id": str(clinic_b.id),
        },
    )

    assert listed.status_code == 200
    listed_ids = {row["id"] for row in listed.json()}
    assert str(patient_a.id) in listed_ids
    assert str(patient_b.id) not in listed_ids
    assert own.status_code == 200
    assert foreign.status_code == 403
    assert create_foreign.status_code == 403


@pytest.mark.asyncio
async def test_clinical_history_enforces_clinic_role_and_related_resources(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    clinic_a = Clinica(nombre=f"Historial A {uuid4().hex[:8]}", activa=True)
    clinic_b = Clinica(nombre=f"Historial B {uuid4().hex[:8]}", activa=True)
    family = FamiliaTratamiento(nombre=f"Familia {uuid4().hex[:8]}", activo=True)
    db_session.add_all([clinic_a, clinic_b, family])
    await db_session.flush()

    doctor_a = Doctor(nombre="Doctora A", clinica_id=clinic_a.id, activo=True)
    doctor_b = Doctor(nombre="Doctor B", clinica_id=clinic_b.id, activo=True)
    patient_a = Paciente(nombre="Paciente", apellidos="Historial A", clinica_id=clinic_a.id)
    patient_b = Paciente(nombre="Paciente", apellidos="Historial B", clinica_id=clinic_b.id)
    treatment = TratamientoCatalogo(
        familia_id=family.id,
        codigo=f"AUTH-{uuid4().hex[:8]}",
        nombre="Tratamiento autorizado",
        precio=Decimal("90.00"),
        iva_porcentaje=Decimal("0.00"),
        requiere_pieza=True,
        requiere_caras=False,
        activo=True,
    )
    db_session.add_all([doctor_a, doctor_b, patient_a, patient_b, treatment])
    await db_session.flush()

    doctor_user_a = Usuario(
        username=f"history-doctor-a-{uuid4().hex[:8]}",
        password_hash="not-used",
        nombre="Doctor A",
        rol="doctor",
        clinica_id=clinic_a.id,
        doctor_id=doctor_a.id,
        activo=True,
    )
    doctor_user_b = Usuario(
        username=f"history-doctor-b-{uuid4().hex[:8]}",
        password_hash="not-used",
        nombre="Doctor B",
        rol="doctor",
        clinica_id=clinic_b.id,
        doctor_id=doctor_b.id,
        activo=True,
    )
    reception_user_a = Usuario(
        username=f"history-reception-a-{uuid4().hex[:8]}",
        password_hash="not-used",
        nombre="Recepcion A",
        rol="recepcion",
        clinica_id=clinic_a.id,
        activo=True,
    )
    db_session.add_all([doctor_user_a, doctor_user_b, reception_user_a])
    await db_session.flush()

    existing_a = HistorialClinico(
        paciente_id=patient_a.id,
        tratamiento_id=treatment.id,
        doctor_id=doctor_a.id,
        fecha=date.today(),
        procedimiento="Registro de clinica A",
        estado="realizado",
    )
    existing_b = HistorialClinico(
        paciente_id=patient_b.id,
        tratamiento_id=treatment.id,
        doctor_id=doctor_b.id,
        fecha=date.today(),
        procedimiento="Registro de clinica B",
        estado="realizado",
    )
    db_session.add_all([existing_a, existing_b])
    await db_session.commit()

    doctor_a_headers = bearer_headers(
        "doctor",
        clinic_id=clinic_a.id,
        user_id=doctor_user_a.id,
    )
    doctor_b_headers = bearer_headers(
        "doctor",
        clinic_id=clinic_b.id,
        user_id=doctor_user_b.id,
    )
    reception_a_headers = bearer_headers(
        "recepcion",
        clinic_id=clinic_a.id,
        user_id=reception_user_a.id,
    )
    create_payload = {
        "paciente_id": str(patient_a.id),
        "tratamiento_id": str(treatment.id),
        "doctor_id": str(doctor_a.id),
        "pieza_dental": 24,
        "fecha": date.today().isoformat(),
        "procedimiento": "Tratamiento valido",
        "estado": "realizado",
        "importe": "90.00",
    }

    own_read = await client.get(
        f"/api/tratamientos/historial/{patient_a.id}",
        headers=doctor_a_headers,
    )
    cross_read = await client.get(
        f"/api/tratamientos/historial/{patient_b.id}",
        headers=doctor_a_headers,
    )
    reception_write = await client.post(
        "/api/tratamientos/historial",
        headers=reception_a_headers,
        json=create_payload,
    )
    cross_patient_write = await client.post(
        "/api/tratamientos/historial",
        headers=doctor_a_headers,
        json={**create_payload, "paciente_id": str(patient_b.id)},
    )
    cross_doctor_write = await client.post(
        "/api/tratamientos/historial",
        headers=doctor_a_headers,
        json={**create_payload, "doctor_id": str(doctor_b.id)},
    )
    valid_write = await client.post(
        "/api/tratamientos/historial",
        headers=doctor_a_headers,
        json=create_payload,
    )

    assert own_read.status_code == 200
    assert {row["id"] for row in own_read.json()} == {str(existing_a.id)}
    assert cross_read.status_code == 403
    assert reception_write.status_code == 403
    assert cross_patient_write.status_code == 403
    assert cross_doctor_write.status_code == 403
    assert valid_write.status_code == 201

    created_id = valid_write.json()["id"]
    reception_patch = await client.patch(
        f"/api/tratamientos/historial/{created_id}",
        headers=reception_a_headers,
        json={"observaciones": "No autorizada", "revision": 1},
    )
    cross_clinic_patch = await client.patch(
        f"/api/tratamientos/historial/{created_id}",
        headers=doctor_b_headers,
        json={"observaciones": "No autorizada", "revision": 1},
    )
    valid_patch = await client.patch(
        f"/api/tratamientos/historial/{created_id}",
        headers=doctor_a_headers,
        json={"observaciones": "Evolucion autorizada", "revision": 1},
    )

    assert reception_patch.status_code == 403
    assert cross_clinic_patch.status_code == 403
    assert valid_patch.status_code == 200
    assert valid_patch.json()["observaciones"] == "Evolucion autorizada"


@pytest.mark.asyncio
async def test_financial_data_and_payments_are_isolated_between_clinics(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    # A dedicated fixture period keeps this exact-total assertion independent
    # of current-day legacy invoices committed by PDF tests. Both tenants are
    # inside the same period, so a tenant leak would still produce 1,000 EUR.
    fixture_day = date(2000, 1, 2)
    clinic_a = Clinica(nombre=f"Facturacion A {uuid4().hex[:8]}", activa=True)
    clinic_b = Clinica(nombre=f"Facturacion B {uuid4().hex[:8]}", activa=True)
    db_session.add_all([clinic_a, clinic_b])
    await db_session.flush()
    patient_a = Paciente(nombre="Factura", apellidos="Clinica A", clinica_id=clinic_a.id)
    patient_b = Paciente(nombre="Factura", apellidos="Clinica B", clinica_id=clinic_b.id)
    db_session.add_all([patient_a, patient_b])
    await db_session.flush()
    invoice_a = Factura(
        paciente_id=patient_a.id,
        clinica_id=clinic_a.id,
        serie="TA",
        numero=1,
        fecha=fixture_day,
        tipo="paciente",
        subtotal=Decimal("100.00"),
        iva_total=Decimal("0.00"),
        total=Decimal("100.00"),
        estado="emitida",
    )
    invoice_b = Factura(
        paciente_id=patient_b.id,
        clinica_id=clinic_b.id,
        serie="TB",
        numero=1,
        fecha=fixture_day,
        tipo="paciente",
        subtotal=Decimal("900.00"),
        iva_total=Decimal("0.00"),
        total=Decimal("900.00"),
        estado="emitida",
    )
    db_session.add_all([invoice_a, invoice_b])
    await db_session.commit()

    headers = await persisted_bearer_headers(db_session, "recepcion", clinic_a.id)
    listed = await client.get("/api/facturas?limit=200", headers=headers)
    foreign = await client.get(f"/api/facturas/{invoice_b.id}", headers=headers)
    foreign_payment = await client.post(
        f"/api/facturas/{invoice_b.id}/cobros",
        headers=headers,
        json={"forma_pago_id": str(uuid4()), "importe": "10.00"},
    )
    income = await client.get(
        "/api/reportes/ingresos",
        headers=headers,
        params={"desde": fixture_day.isoformat(), "hasta": fixture_day.isoformat()},
    )

    assert listed.status_code == 200
    listed_ids = {row["id"] for row in listed.json()}
    assert str(invoice_a.id) in listed_ids
    assert str(invoice_b.id) not in listed_ids
    assert foreign.status_code == 403
    assert foreign_payment.status_code == 403
    assert income.status_code == 200
    assert income.json()["total"] == 100.0


@pytest.mark.asyncio
async def test_unassigned_staff_user_cannot_cross_into_a_named_clinic(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    clinic = Clinica(nombre=f"Clinica aislada {uuid4().hex[:8]}", activa=True)
    db_session.add(clinic)
    await db_session.flush()
    scoped_patient = Paciente(
        nombre="Paciente",
        apellidos=f"Con clinica {uuid4().hex[:8]}",
        clinica_id=clinic.id,
    )
    legacy_patient = Paciente(
        nombre="Paciente",
        apellidos=f"Legacy {uuid4().hex[:8]}",
    )
    db_session.add_all([scoped_patient, legacy_patient])
    await db_session.commit()

    headers = await persisted_bearer_headers(db_session, "recepcion")
    listed = await client.get("/api/pacientes?limit=200", headers=headers)
    direct = await client.get(f"/api/pacientes/{scoped_patient.id}", headers=headers)
    create_in_clinic = await client.post(
        "/api/pacientes",
        headers=headers,
        json={
            "nombre": "No",
            "apellidos": "Permitido",
            "clinica_id": str(clinic.id),
        },
    )

    assert listed.status_code == 200
    listed_ids = {row["id"] for row in listed.json()}
    assert str(legacy_patient.id) in listed_ids
    assert str(scoped_patient.id) not in listed_ids
    assert direct.status_code == 403
    assert create_in_clinic.status_code == 403


@pytest.mark.asyncio
async def test_unassigned_staff_only_sees_legacy_records_in_manual_lists(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    clinic = Clinica(nombre=f"Clinica manual {uuid4().hex[:8]}", activa=True)
    db_session.add(clinic)
    await db_session.flush()
    scoped_patient = Paciente(
        nombre="Paciente",
        apellidos="Manual con clinica",
        clinica_id=clinic.id,
    )
    legacy_patient = Paciente(nombre="Paciente", apellidos="Manual legacy")
    scoped_doctor = Doctor(nombre="Doctor con clinica", clinica_id=clinic.id)
    legacy_doctor = Doctor(nombre="Doctor legacy")
    laboratory = Laboratorio(nombre=f"Laboratorio {uuid4().hex[:8]}")
    db_session.add_all(
        [scoped_patient, legacy_patient, scoped_doctor, legacy_doctor, laboratory]
    )
    await db_session.flush()
    scoped_appointment = Cita(
        paciente_id=scoped_patient.id,
        doctor_id=scoped_doctor.id,
        clinica_id=clinic.id,
        fecha_hora=datetime.now(UTC),
    )
    legacy_appointment = Cita(
        paciente_id=legacy_patient.id,
        doctor_id=legacy_doctor.id,
        fecha_hora=datetime.now(UTC),
    )
    scoped_template = RecetaPlantilla(
        clinica_id=clinic.id,
        nombre="Plantilla con clinica",
        nombre_original="scoped.pdf",
        nombre_guardado="scoped.pdf",
        ruta="recetas/plantillas/scoped.pdf",
        mime_type="application/pdf",
        tamano_bytes=10,
    )
    legacy_template = RecetaPlantilla(
        nombre="Plantilla legacy",
        nombre_original="legacy.pdf",
        nombre_guardado="legacy.pdf",
        ruta="recetas/plantillas/legacy.pdf",
        mime_type="application/pdf",
        tamano_bytes=10,
    )
    db_session.add_all(
        [scoped_appointment, legacy_appointment, scoped_template, legacy_template]
    )
    await db_session.flush()
    scoped_work = TrabajoLaboratorio(
        paciente_id=scoped_patient.id,
        doctor_id=scoped_doctor.id,
        laboratorio_id=laboratory.id,
        descripcion="Trabajo con clinica",
    )
    legacy_work = TrabajoLaboratorio(
        paciente_id=legacy_patient.id,
        doctor_id=legacy_doctor.id,
        laboratorio_id=laboratory.id,
        descripcion="Trabajo legacy",
    )
    scoped_call = CitaTelefonear(
        cita_original_id=scoped_appointment.id,
        paciente_id=scoped_patient.id,
        doctor_id=scoped_doctor.id,
    )
    legacy_call = CitaTelefonear(
        cita_original_id=legacy_appointment.id,
        paciente_id=legacy_patient.id,
        doctor_id=legacy_doctor.id,
    )
    db_session.add_all([scoped_work, legacy_work, scoped_call, legacy_call])
    await db_session.commit()

    headers = bearer_headers("recepcion")
    clinics = await client.get("/api/clinicas", headers=headers)
    templates = await client.get("/api/recetas/plantillas", headers=headers)
    works = await client.get("/api/laboratorio/trabajos", headers=headers)
    call_queue = await client.get("/api/citas/panel/telefonear/pendientes", headers=headers)

    assert {
        "clinics": clinics.status_code,
        "templates": templates.status_code,
        "works": works.status_code,
        "call_queue": call_queue.status_code,
    } == {
        "clinics": 200,
        "templates": 200,
        "works": 200,
        "call_queue": 200,
    }

    template_ids = {row["id"] for row in templates.json()}
    assert str(legacy_template.id) in template_ids
    work_ids = {row["id"] for row in works.json()}
    assert str(legacy_work.id) in work_ids
    call_ids = {row["id"] for row in call_queue.json()}
    assert str(legacy_call.id) in call_ids
    assert {
        "clinic": str(clinic.id) in {row["id"] for row in clinics.json()},
        "template": str(scoped_template.id) in template_ids,
        "work": str(scoped_work.id) in work_ids,
        "call_queue": str(scoped_call.id) in call_ids,
    } == {
        "clinic": False,
        "template": False,
        "work": False,
        "call_queue": False,
    }
