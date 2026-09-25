"""Read model boundaries against real PostgreSQL, including sensitive discovery."""
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException

from app.core.crypto import cifrar_campos_paciente
from app.core.documents.pdf import generar_documento_clinico_pdf
from app.core.permissions import TokenData, get_current_user
from app.core.persistence.audit_log import AuditLog
from app.domains.billing.persistence.factura import (
    Cobro,
    Factura,
    FormaPago,
    PagoAnticipadoPaciente,
)
from app.domains.clinical.application import documentos as document_service
from app.domains.clinical.persistence.consentimiento import Consentimiento
from app.domains.clinical.persistence.documento import DocumentoPaciente
from app.domains.clinical.persistence.receta import RecetaClinica
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.domains.reporting.api.reportes import _facturacion_resumen
from app.domains.reporting.application.registros import build_query, consultar_registros, opciones
from app.domains.reporting.application.registros_catalogo import catalog_for_user
from app.domains.reporting.schemas.registros import RegistroFilters
from app.domains.scheduling.persistence.cita import Cita
from app.main import app


@pytest_asyncio.fixture
async def records(db_session):
    clinic_a = Clinica(id=uuid4(), nombre="Consulta Registros A")
    clinic_b = Clinica(id=uuid4(), nombre="Consulta Registros B")
    db_session.add_all([clinic_a, clinic_b])
    await db_session.flush()
    doctor = Doctor(id=uuid4(), nombre="Dra. López", clinica_id=clinic_a.id)
    db_session.add(doctor)
    await db_session.flush()
    dni = await cifrar_campos_paciente(db_session, {"dni_nie": "12345678Z"})
    patients = [Paciente(id=uuid4(), nombre=name, apellidos="Álvarez Muñoz", clinica_id=clinic_a.id, doctor_habitual_id=doctor.id) for name in ["María", "Julia", "Pablo"]]
    patients[0].dni_nie = dni["dni_nie"]
    other = Paciente(id=uuid4(), nombre="Paciente ajeno", apellidos="Álvarez Muñoz", clinica_id=clinic_b.id)
    legacy = Paciente(id=uuid4(), nombre="Paciente sin clínica", apellidos="Álvarez Muñoz")
    user = Usuario(id=uuid4(), nombre="Usuario registros", username=f"records-{uuid4().hex[:8]}", password_hash="test", rol="recepcion", clinica_id=clinic_a.id)
    db_session.add_all([*patients, other, legacy, user])
    await db_session.flush()
    return {"a": clinic_a, "b": clinic_b, "doctor": doctor, "patients": patients, "other": other, "legacy": legacy, "user": user,
            "admin": TokenData(user.id, user.username, "admin"),
            "reception": TokenData(user.id, user.username, "recepcion", clinic_a.id),
            "clinical": TokenData(user.id, user.username, "doctor", clinic_a.id)}


async def test_accent_search_pagination_stable_order_and_tenant(db_session, records):
    filters = RegistroFilters(q="  ALVAREZ   munoz ", sort_by="paciente", sort_dir="asc", limit=2)
    first = await consultar_registros(db_session, records["reception"], "pacientes", filters)
    second = await consultar_registros(db_session, records["reception"], "pacientes", filters.model_copy(update={"offset": 2}))
    assert first.total == second.total == 3
    assert len(first.rows) == 2 and len(second.rows) == 1
    assert len({row.id for row in [*first.rows, *second.rows]}) == 3
    assert all(row.target.patient_id not in {str(records["other"].id), str(records["legacy"].id)} for row in first.rows)


async def test_patient_dni_search_does_not_return_dni(db_session, records):
    result = await consultar_registros(db_session, records["reception"], "pacientes", RegistroFilters(q="12345678Z"))
    assert result.total == 1
    assert result.rows[0].target.patient_id == str(records["patients"][0].id)
    assert "12345678Z" not in result.model_dump_json()


async def test_explicit_foreign_tenant_filter_denied_and_foreign_patient_empty(db_session, records):
    with pytest.raises(HTTPException) as error:
        build_query("pacientes", RegistroFilters(clinica_id=records["b"].id), records["reception"])
    assert error.value.status_code == 403
    result = await consultar_registros(db_session, records["reception"], "pacientes", RegistroFilters(paciente_id=records["other"].id))
    assert result.total == 0
    unassigned = TokenData(uuid4(), "legacy", "recepcion")
    result = await consultar_registros(db_session, unassigned, "pacientes", RegistroFilters())
    assert result.total == 0


@pytest.mark.parametrize("role,forbidden", [("recepcion", "realizados"), ("recepcion", "auditoria"), ("doctor", "facturas"), ("auxiliar", "cobros"), ("paciente", "pacientes")])
def test_catalog_and_query_share_role_policy(role, forbidden):
    user = TokenData(uuid4(), "role", role, uuid4())
    with pytest.raises(HTTPException) as error:
        build_query(forbidden, RegistroFilters(), user)
    assert error.value.status_code == 403
    if role != "paciente":
        assert forbidden not in {view.id for view in catalog_for_user(user)}


def test_rejects_unavailable_filter_and_sort(records):
    for filters in [RegistroFilters(sort_by="search"), RegistroFilters(sort_by="paciente; DROP TABLE pacientes"), RegistroFilters(importe_min=1)]:
        with pytest.raises(HTTPException) as error:
            build_query("pacientes", filters, records["reception"])
        assert error.value.status_code == 422


async def test_date_filter_uses_clinic_calendar_and_inclusive_last_day(db_session, records):
    patient = records["patients"][0]
    # 22:30 UTC is the next clinic day (Europe/Madrid in June).
    db_session.add_all([Cita(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, doctor_id=records["doctor"].id, fecha_hora=datetime(2026, 6, day, 22, 30, tzinfo=timezone.utc), estado="programada") for day in [3, 4]])
    await db_session.flush()
    result = await consultar_registros(db_session, records["reception"], "citas", RegistroFilters(paciente_id=patient.id, fecha_desde=date(2026, 6, 4), fecha_hasta=date(2026, 6, 4)))
    assert result.total == 1
    assert result.rows[0].target.date == "2026-06-04"
    assert result.rows[0].target.doctor_id == str(records["doctor"].id)
    assert result.rows[0].cells["fecha"].startswith("2026-06-04T00:30:00")
    assert result.rows[0].cells["fecha"].endswith("+02:00")


async def test_repeated_autumn_hour_preserves_both_distinct_instants(db_session, records):
    patient = records["patients"][0]
    db_session.add_all([Cita(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, doctor_id=records["doctor"].id, fecha_hora=datetime(2026, 10, 25, hour, 30, tzinfo=timezone.utc)) for hour in [0, 1]])
    await db_session.flush()
    result = await consultar_registros(db_session, records["reception"], "citas", RegistroFilters(paciente_id=patient.id, fecha_desde=date(2026, 10, 25), fecha_hasta=date(2026, 10, 25)))
    assert {row.cells["fecha"] for row in result.rows} == {"2026-10-25T02:30:00+02:00", "2026-10-25T02:30:00+01:00"}


async def test_documents_reception_never_discovers_clinical_files_or_prescriptions(db_session, records):
    patient = records["patients"][0]
    for category in ["circular", "radiografia", "otro", "historia_medica"]:
        db_session.add(DocumentoPaciente(id=uuid4(), paciente_id=patient.id, nombre_original=f"{category}.pdf", nombre_guardado=f"{category}.pdf", ruta="uploads/test", mime_type="application/pdf", tamano_bytes=42, categoria=category, descripcion="Dato clínico reservado"))
    db_session.add(RecetaClinica(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, doctor_id=records["doctor"].id, medicamento="Medicación reservada", fecha_prescripcion=date.today()))
    await db_session.flush()
    filters = RegistroFilters(paciente_id=patient.id)
    reception = await consultar_registros(db_session, records["reception"], "documentos", filters)
    doctor = await consultar_registros(db_session, records["clinical"], "documentos", filters)
    assert reception.total == 1
    assert reception.rows[0].cells["tipo"] == "circular"
    assert doctor.total == 5
    assert all("Dato clínico reservado" not in row.model_dump_json() for row in reception.rows)
    hidden = await consultar_registros(db_session, records["reception"], "actividad", RegistroFilters(paciente_id=patient.id, q="Medicación reservada"))
    assert hidden.total == 0


@pytest.mark.parametrize("role,allowed", [("doctor", False), ("auxiliar", False), ("recepcion", True), ("admin", True)])
async def test_invoice_attachments_follow_billing_permissions_but_plans_remain_clinical(client, db_session, records, tmp_path, monkeypatch, role, allowed):
    patient = records["patients"][0]
    user = TokenData(records["user"].id, role, role, records["a"].id)
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(document_service, "UPLOAD_ROOT", tmp_path)
    folder = tmp_path / str(patient.id)
    folder.mkdir()
    pdf = generar_documento_clinico_pdf(titulo="Documento de prueba", contenido="Contenido", paciente_nombre=patient.nombre, fecha_documento=date.today(), firma_data_url=None)
    documents = {}
    for category in ["factura", "presupuesto"]:
        filename = f"{category}.pdf"
        (folder / filename).write_bytes(pdf)
        documents[category] = DocumentoPaciente(id=uuid4(), paciente_id=patient.id, categoria=category, nombre_original=filename, nombre_guardado=filename, ruta=str(folder / filename), mime_type="application/pdf", tamano_bytes=len(pdf))
        db_session.add(documents[category])
    await db_session.flush()
    catalog = next(view for view in catalog_for_user(user) if view.id == "documentos")
    assert ("factura" in {option.value for option in catalog.types}) is allowed
    assert "presupuesto" in {option.value for option in catalog.types}
    listing = await consultar_registros(db_session, user, "documentos", RegistroFilters(paciente_id=patient.id))
    assert {row.cells["tipo"] for row in listing.rows} == ({"factura", "presupuesto"} if allowed else {"presupuesto"})
    canonical = await client.get(f"/api/pacientes/{patient.id}/documentos")
    assert {row["categoria"] for row in canonical.json()} == ({"factura", "presupuesto"} if allowed else {"presupuesto"})
    invoice = await client.get(f"/api/pacientes/{patient.id}/documentos/{documents['factura'].id}/descargar")
    assert invoice.status_code == (200 if allowed else 403)
    if allowed:
        assert invoice.content == pdf
    plan = await client.get(f"/api/pacientes/{patient.id}/documentos/{documents['presupuesto'].id}/descargar")
    assert plan.status_code == 200 and plan.content == pdf
    export = await client.get("/api/registros/documentos/export", params={"paciente_id": str(patient.id), "format": "csv"})
    assert export.status_code == 200
    assert ("factura.pdf" in export.text) is allowed
    if role != "auxiliar":
        preview = await client.get("/api/portal/documentos", params={"paciente_id": str(patient.id)})
        assert {row["categoria"] for row in preview.json()} == ({"factura", "presupuesto"} if allowed else {"presupuesto"})


async def test_saldos_include_advances_exclude_voided_payments_and_invoices(db_session, records):
    patient = records["patients"][0]
    pay = FormaPago(id=uuid4(), nombre="Tarjeta registros")
    invoice = Factura(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, serie="T", numero=987654, fecha=date.today(), subtotal=100, iva_total=0, total=100)
    cancelled = Factura(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, serie="T", numero=987655, fecha=date.today(), subtotal=800, iva_total=0, total=800, estado="anulada")
    db_session.add_all([pay, invoice, cancelled])
    await db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        Cobro(id=uuid4(), factura_id=invoice.id, fecha=now, importe=30, forma_pago_id=pay.id, usuario_id=records["user"].id),
        Cobro(id=uuid4(), factura_id=invoice.id, fecha=now, importe=20, forma_pago_id=pay.id, usuario_id=records["user"].id, anulado_at=now),
        PagoAnticipadoPaciente(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, fecha=now, importe=10, forma_pago_id=pay.id, usuario_id=records["user"].id),
    ])
    await db_session.flush()
    from tests.billing_fixtures import backfill_account_ledger
    await backfill_account_ledger(db_session)
    result = await consultar_registros(db_session, records["reception"], "saldos", RegistroFilters(paciente_id=patient.id, saldo_min=Decimal("60"), saldo_max=Decimal("60")))
    assert result.total == 1
    assert result.rows[0].cells["facturado"] == 100
    assert result.rows[0].cells["cobrado"] == 40
    assert result.rows[0].cells["saldo"] == 60
    payments = await consultar_registros(db_session, records["reception"], "cobros", RegistroFilters(paciente_id=patient.id, tipo="anticipo"))
    assert payments.total == 1


async def test_balances_do_not_reveal_foreign_clinic_money_even_with_legacy_patient_links(db_session, records):
    patient = records["patients"][0]
    db_session.add(Factura(id=uuid4(), paciente_id=patient.id, clinica_id=records["b"].id, serie="T", numero=987656, fecha=date.today(), subtotal=999, iva_total=0, total=999))
    await db_session.flush()
    from tests.billing_fixtures import backfill_account_ledger
    await backfill_account_ledger(db_session)
    result = await consultar_registros(db_session, records["reception"], "saldos", RegistroFilters(paciente_id=patient.id))
    assert result.rows[0].cells["saldo"] == 0
    admin = await consultar_registros(db_session, records["admin"], "saldos", RegistroFilters(paciente_id=patient.id))
    assert admin.rows[0].cells["saldo"] == 999


async def test_legacy_report_range_uses_same_clinic_day_as_records(db_session, records):
    patient = records["patients"][0]
    pay = FormaPago(id=uuid4(), nombre="Tarjeta horario")
    invoice = Factura(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, serie="H", numero=987657, fecha=date(2026, 6, 4), subtotal=100, iva_total=0, total=100)
    db_session.add_all([pay, invoice])
    await db_session.flush()
    db_session.add(Cobro(id=uuid4(), factura_id=invoice.id, fecha=datetime(2026, 6, 3, 22, 30, tzinfo=timezone.utc), importe=40, forma_pago_id=pay.id, usuario_id=records["user"].id))
    await db_session.flush()
    result = await _facturacion_resumen(db_session, records["reception"], date(2026, 6, 4), date(2026, 6, 4))
    assert result["total_cobrado"] == 40


async def test_lookup_id_is_scoped_and_label_can_be_restored(db_session, records):
    mine = await opciones(db_session, records["reception"], "pacientes", str(records["patients"][0].id))
    other = await opciones(db_session, records["reception"], "pacientes", str(records["other"].id))
    assert len(mine) == 1 and "Álvarez" in mine[0].label
    assert other == []


async def test_every_catalog_view_executes_with_only_declared_columns(db_session, records):
    for view in catalog_for_user(records["admin"]):
        result = await consultar_registros(db_session, records["admin"], view.id, RegistroFilters(limit=1))
        for row in result.rows:
            assert set(row.cells) == {column.key for column in view.columns}
            assert "search" not in row.cells and "dni_nie" not in row.cells


async def test_canonical_document_routes_cannot_bypass_disclosure_policy(client, db_session, records):
    patient = records["patients"][0]
    private_doc = DocumentoPaciente(id=uuid4(), paciente_id=patient.id, categoria="radiografia", nombre_original="privado.pdf", nombre_guardado="privado.pdf", ruta="test", mime_type="application/pdf", tamano_bytes=40)
    allowed_doc = DocumentoPaciente(id=uuid4(), paciente_id=patient.id, categoria="circular", nombre_original="aviso.pdf", nombre_guardado="aviso.pdf", ruta="test", mime_type="application/pdf", tamano_bytes=40)
    prescription = RecetaClinica(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, doctor_id=records["doctor"].id, medicamento="Reservado", fecha_prescripcion=date.today())
    consent = Consentimiento(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, tipo="Implante", contenido="Reservado", fecha_firma=date.today())
    db_session.add_all([private_doc, allowed_doc, prescription, consent])
    await db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: records["reception"]
    docs = await client.get(f"/api/pacientes/{patient.id}/documentos")
    assert docs.status_code == 200
    assert [item["id"] for item in docs.json()] == [str(allowed_doc.id)]
    for url in [f"/api/pacientes/{patient.id}/documentos/{private_doc.id}/descargar", f"/api/recetas/{prescription.id}", f"/api/recetas/{prescription.id}/pdf", f"/api/recetas?paciente_id={patient.id}", f"/api/pacientes/{patient.id}/consentimientos", f"/api/consentimientos/{consent.id}/pdf"]:
        response = await client.get(url)
        assert response.status_code == 403, (url, response.text)
    # Administrative upload and LOPD/circular workflows remain available.
    allowed = await client.get(f"/api/pacientes/{patient.id}/documentos/{allowed_doc.id}/descargar")
    assert allowed.status_code == 404  # Authorized; the fixture has no disk file.
    portal_docs = await client.get("/api/portal/documentos", params={"paciente_id": str(patient.id)})
    assert portal_docs.status_code == 200
    assert [item["id"] for item in portal_docs.json()] == [str(allowed_doc.id)]
    portal_consent = await client.get("/api/portal/consentimientos", params={"paciente_id": str(patient.id)})
    assert portal_consent.status_code == 403


async def test_existing_patient_portal_signature_keeps_owner_boundary(client, db_session, records):
    patient = records["patients"][0]
    consent = Consentimiento(id=uuid4(), paciente_id=patient.id, clinica_id=records["a"].id, tipo="Implante", contenido="Reservado", estado="firmado", fecha_firma=date.today())
    other = Consentimiento(id=uuid4(), paciente_id=records["other"].id, clinica_id=records["b"].id, tipo="Otro", estado="firmado", fecha_firma=date.today())
    db_session.add_all([consent, other])
    await db_session.flush()
    owner = TokenData(records["user"].id, "paciente", "paciente", records["a"].id, patient.id)
    app.dependency_overrides[get_current_user] = lambda: owner
    # Repeating an existing signature is idempotent; its owner retains access.
    repeat = await client.post(f"/api/portal/consentimientos/{consent.id}/firmar", json={"firma_paciente_base64": "already-signed-document-unchanged"})
    assert repeat.status_code == 200
    foreign = await client.post(f"/api/portal/consentimientos/{other.id}/firmar", json={"firma_paciente_base64": "already-signed-document-unchanged"})
    assert foreign.status_code == 404


async def test_api_export_reuses_filters_order_columns_and_denies_hidden_columns(client, records):
    app.dependency_overrides[get_current_user] = lambda: records["reception"]
    params = [("q", "alvarez munoz"), ("sort_by", "paciente"), ("sort_dir", "asc")]
    listing = await client.get("/api/registros/pacientes", params=[*params, ("limit", "2")])
    assert listing.status_code == 200
    assert listing.json()["total"] == 3 and len(listing.json()["rows"]) == 2
    exported = await client.get("/api/registros/pacientes/export", params=[*params, ("format", "csv"), ("columns", "historia"), ("columns", "paciente")])
    assert exported.status_code == 200
    assert exported.headers["x-export-row-count"] == "3"
    assert exported.text.count("Álvarez") == 3
    assert "DNI" not in exported.text
    for params in [{"format": "csv", "columns": "search"}, {"format": "csv", "columns": "dni_nie"}]:
        denied = await client.get("/api/registros/pacientes/export", params=params)
        assert denied.status_code == 422
    clinical = await client.get("/api/registros/realizados/export", params={"format": "csv"})
    assert clinical.status_code == 403


async def test_audit_detail_reads_one_canonical_record_and_is_admin_only(client, db_session, records):
    entry = AuditLog(usuario_id=records["user"].id, clinica_id=records["a"].id, accion="TEST_REGISTROS", tabla="pacientes", registro_id=records["patients"][0].id, datos_despues={"campo": "valor"})
    db_session.add(entry)
    await db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: records["reception"]
    denied = await client.get(f"/api/registros/auditoria/{entry.id}")
    assert denied.status_code == 403
    app.dependency_overrides[get_current_user] = lambda: records["admin"]
    detail = await client.get(f"/api/registros/auditoria/{entry.id}")
    assert detail.status_code == 200
    assert detail.json()["new_values"] == {"campo": "valor"}
    export = await client.get("/api/registros/auditoria/export", params={"format": "csv"})
    assert export.status_code == 200  # Numeric detail routing must not swallow /export.
