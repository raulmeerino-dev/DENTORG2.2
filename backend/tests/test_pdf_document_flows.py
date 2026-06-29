import base64
from datetime import date
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from PIL import Image as PILImage
from PIL import ImageDraw
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.doctor import Doctor
from app.models.documento import DocumentoPaciente
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario
from app.services.pdf_service import generar_documento_clinico_pdf


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"pdf-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin PDF",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def signature_data_url(*, blank: bool = False) -> str:
    image = PILImage.new("RGBA", (180, 70), (255, 255, 255, 0))
    if not blank:
        draw = ImageDraw.Draw(image)
        draw.line([(12, 42), (48, 25), (84, 45), (126, 20), (165, 36)], fill=(17, 24, 39, 255), width=4)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def receta_template_png() -> bytes:
    image = PILImage.new("RGB", (900, 1260), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle([(40, 40), (860, 1220)], outline=(30, 80, 110), width=3)
    draw.text((70, 70), "Plantilla test receta privada", fill=(30, 80, 110))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def assert_pdf_response(response) -> None:
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.content.startswith(b"%PDF-")
    assert len(response.content) > 600


async def create_patient(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Pilar", "apellidos": "PDF", "telefono": "600000333"},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def create_doctor_and_treatment(db_session: AsyncSession) -> tuple[Doctor, TratamientoCatalogo]:
    doctor = Doctor(nombre="Dra. PDF", color_agenda="#2563eb", activo=True)
    familia = FamiliaTratamiento(nombre="Conservadora", icono="OC", orden=1)
    tratamiento = TratamientoCatalogo(
        familia=familia,
        codigo=f"PDF-{uuid4().hex[:8]}",
        nombre="Obturacion PDF",
        precio=Decimal("75.00"),
        iva_porcentaje=Decimal("0.00"),
    )
    db_session.add_all([doctor, familia, tratamiento])
    await db_session.commit()
    return doctor, tratamiento


@pytest.mark.asyncio
async def test_consentimiento_firmado_archiva_pdf_y_documento(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import consentimientos as consentimientos_api

    monkeypatch.setattr(consentimientos_api, "UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)

    creado = await client.post(
        f"/api/pacientes/{paciente_id}/consentimientos",
        headers=headers,
        json={"tipo": "Endodoncia", "contenido": "Autorizo el tratamiento de endodoncia."},
    )
    assert creado.status_code == 201
    consentimiento_id = creado.json()["id"]
    assert creado.json()["estado"] == "pendiente_firma"

    firmado = await client.post(
        f"/api/consentimientos/{consentimiento_id}/firmar",
        headers=headers,
        json={"firma_paciente_base64": signature_data_url()},
    )
    assert firmado.status_code == 200
    firmado_json = firmado.json()
    assert firmado_json["estado"] == "firmado"
    assert firmado_json["firmado_at"]
    assert firmado_json["documento_id"]
    assert firmado_json["hash_documento"]

    pdf = await client.get(f"/api/consentimientos/{consentimiento_id}/pdf", headers=headers)
    assert_pdf_response(pdf)

    docs = await client.get(f"/api/pacientes/{paciente_id}/documentos", headers=headers)
    assert docs.status_code == 200
    documento = next(item for item in docs.json() if item["id"] == firmado_json["documento_id"])
    assert documento["categoria"] == "consentimiento"
    assert documento["mime_type"] == "application/pdf"

    descarga = await client.get(
        f"/api/pacientes/{paciente_id}/documentos/{firmado_json['documento_id']}/descargar",
        headers=headers,
    )
    assert_pdf_response(descarga)

    bloqueado = await client.patch(
        f"/api/pacientes/{paciente_id}/consentimientos/{consentimiento_id}",
        headers=headers,
        json={"contenido": "No permitido"},
    )
    assert bloqueado.status_code == 409


@pytest.mark.asyncio
async def test_consentimiento_rechaza_estado_firmado_y_firmas_invalidas(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import consentimientos as consentimientos_api

    monkeypatch.setattr(consentimientos_api, "UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)

    firmado_sin_firma = await client.post(
        f"/api/pacientes/{paciente_id}/consentimientos",
        headers=headers,
        json={"tipo": "Implantes", "estado": "firmado", "contenido": "Autorizacion."},
    )
    assert firmado_sin_firma.status_code == 422

    creado = await client.post(
        f"/api/pacientes/{paciente_id}/consentimientos",
        headers=headers,
        json={"tipo": "Implantes", "contenido": "Autorizacion."},
    )
    consentimiento_id = creado.json()["id"]

    for firma in [
        "data:image/png;base64,no-es-base64",
        "data:image/png;base64," + base64.b64encode(b"no-es-una-imagen").decode("ascii"),
        signature_data_url(blank=True),
    ]:
        response = await client.post(
            f"/api/consentimientos/{consentimiento_id}/firmar",
            headers=headers,
            json={"firma_paciente_base64": firma},
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_documento_clinico_pdf_descarga_y_archivo_inexistente(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import documentos as documentos_api

    monkeypatch.setattr(documentos_api, "UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)

    creado = await client.post(
        f"/api/pacientes/{paciente_id}/documentos/generar-pdf",
        headers=headers,
        json={
            "titulo": "Circular clinica",
            "categoria": "circular",
            "contenido": "El paciente acude a consulta.",
            "firma_data_url": signature_data_url(),
        },
    )
    assert creado.status_code == 201
    documento_id = creado.json()["id"]

    descarga = await client.get(f"/api/pacientes/{paciente_id}/documentos/{documento_id}/descargar", headers=headers)
    assert_pdf_response(descarga)

    doc = await db_session.get(DocumentoPaciente, UUID(documento_id))
    assert doc is not None
    doc.nombre_guardado = "archivo_inexistente.pdf"
    await db_session.commit()

    missing = await client.get(f"/api/pacientes/{paciente_id}/documentos/{documento_id}/descargar", headers=headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_subida_documento_valida_mime_real_extension_y_categoria(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import documentos as documentos_api

    monkeypatch.setattr(documentos_api, "UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)
    pdf_bytes = generar_documento_clinico_pdf(
        titulo="Informe externo",
        contenido="Contenido externo validado.",
        paciente_nombre="Pilar PDF",
        fecha_documento=date.today(),
    )

    mismatch = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "informe"},
        files={"archivo": ("informe.jpg", pdf_bytes, "image/jpeg")},
    )
    assert mismatch.status_code == 415

    declared_mismatch = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "informe"},
        files={"archivo": ("informe.pdf", pdf_bytes, "image/jpeg")},
    )
    assert declared_mismatch.status_code == 415

    empty = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "informe"},
        files={"archivo": ("vacio.pdf", b"", "application/pdf")},
    )
    assert empty.status_code == 422

    invalid_category = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "categoria_invalida"},
        files={"archivo": ("informe.pdf", pdf_bytes, "application/pdf")},
    )
    assert invalid_category.status_code == 422

    generic_mime = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "informe"},
        files={"archivo": ("informe-generico.pdf", pdf_bytes, "application/octet-stream")},
    )
    assert generic_mime.status_code == 201
    assert generic_mime.json()["mime_type"] == "application/pdf"

    valid = await client.post(
        f"/api/pacientes/{paciente_id}/documentos",
        headers=headers,
        data={"categoria": "informe", "descripcion": "Informe externo"},
        files={"archivo": ("informe.pdf", pdf_bytes, "application/pdf")},
    )
    assert valid.status_code == 201
    assert valid.json()["mime_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_pdfs_factura_presupuesto_y_receta_validos(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import recetas as recetas_api
    from app.services import fiscal_document_service

    monkeypatch.setattr(fiscal_document_service, "get_settings", lambda: SimpleNamespace(storage_root=str(tmp_path)))
    monkeypatch.setattr(recetas_api, "PLANTILLA_ROOT", tmp_path / "recetas" / "plantillas")
    monkeypatch.setattr(recetas_api, "PACIENTE_UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)
    doctor, tratamiento = await create_doctor_and_treatment(db_session)

    presupuesto = await client.post(
        "/api/presupuestos",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha": date.today().isoformat(),
            "lineas": [
                {
                    "tratamiento_id": str(tratamiento.id),
                    "pieza_dental": 24,
                    "caras": "O",
                    "precio_unitario": "75.00",
                    "descuento_porcentaje": "0",
                }
            ],
        },
    )
    assert presupuesto.status_code == 201
    presupuesto_pdf = await client.get(f"/api/pdf/presupuestos/{presupuesto.json()['id']}", headers=headers)
    assert_pdf_response(presupuesto_pdf)

    factura = await client.post(
        "/api/facturas",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "serie": "A",
            "fecha": date.today().isoformat(),
            "tipo": "paciente",
            "lineas": [{"concepto": "Obturacion PDF", "cantidad": 1, "precio_unitario": "75.00", "iva_porcentaje": "0"}],
        },
    )
    assert factura.status_code == 201
    factura_pdf = await client.get(f"/api/pdf/facturas/{factura.json()['id']}", headers=headers)
    assert_pdf_response(factura_pdf)

    plantilla = await client.post(
        "/api/recetas/plantillas",
        headers=headers,
        data={"nombre": "Receta privada test", "requiere_dni": "false", "requiere_fecha_nacimiento": "false"},
        files={"archivo": ("receta-test.png", receta_template_png(), "image/png")},
    )
    assert plantilla.status_code == 201

    receta = await client.post(
        f"/api/recetas/pacientes/{paciente_id}",
        headers=headers,
        json={
            "doctor_id": str(doctor.id),
            "plantilla_id": plantilla.json()["id"],
            "medicamento": "Ibuprofeno 600 mg",
            "posologia": "1 comprimido cada 8 horas si dolor.",
            "unidades": "1 envase",
            "duracion": "5 dias",
            "prescriptor_num_colegiado": "28000123",
            "prescriptor_colegio": "Colegio Madrid",
            "prescriptor_provincia": "Madrid",
            "firma_data_url": signature_data_url(),
        },
    )
    assert receta.status_code == 201
    receta_pdf_before_emitir = await client.get(f"/api/recetas/{receta.json()['id']}/pdf", headers=headers)
    assert receta_pdf_before_emitir.status_code == 409

    emitida = await client.post(
        f"/api/recetas/{receta.json()['id']}/emitir-local",
        headers=headers,
        json={"plantilla_id": plantilla.json()["id"]},
    )
    assert emitida.status_code == 200
    assert emitida.json()["estado"] == "emitida_local"
    assert emitida.json()["pdf_documento_id"]
    assert emitida.json()["pdf_hash_sha256"]

    receta_pdf = await client.get(f"/api/recetas/{receta.json()['id']}/pdf", headers=headers)
    assert_pdf_response(receta_pdf)


@pytest.mark.asyncio
async def test_receta_rechaza_firma_y_plantilla_invalidas(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import recetas as recetas_api

    monkeypatch.setattr(recetas_api, "PLANTILLA_ROOT", tmp_path / "recetas" / "plantillas")
    monkeypatch.setattr(recetas_api, "PACIENTE_UPLOAD_ROOT", tmp_path / "pacientes")
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)
    doctor, _ = await create_doctor_and_treatment(db_session)

    plantilla_invalida = await client.post(
        "/api/recetas/plantillas",
        headers=headers,
        data={"nombre": "Plantilla corrupta", "requiere_dni": "false"},
        files={"archivo": ("plantilla.pdf", b"no-es-pdf", "application/pdf")},
    )
    assert plantilla_invalida.status_code == 415

    firma_invalida = await client.post(
        f"/api/recetas/pacientes/{paciente_id}",
        headers=headers,
        json={
            "doctor_id": str(doctor.id),
            "firma_data_url": "data:image/png;base64,no-es-base64",
        },
    )
    assert firma_invalida.status_code == 422


@pytest.mark.asyncio
async def test_receta_mock_provider_genera_pdf_sin_certificacion_real(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    from app.api import recetas as recetas_api
    from app.services import receta_provider_service

    monkeypatch.setattr(recetas_api, "PLANTILLA_ROOT", tmp_path / "recetas" / "plantillas")
    monkeypatch.setattr(recetas_api, "PACIENTE_UPLOAD_ROOT", tmp_path / "pacientes")
    monkeypatch.setattr(
        receta_provider_service,
        "get_settings",
        lambda: SimpleNamespace(
            receta_provider="mock",
            receta_provider_base_url="",
            receta_provider_client_id="",
            receta_provider_client_secret="",
        ),
    )
    headers = await auth_headers(client, db_session)
    paciente_id = await create_patient(client, headers)
    doctor, _ = await create_doctor_and_treatment(db_session)

    status_response = await client.get("/api/recetas/provider-status", headers=headers)
    assert status_response.status_code == 200
    assert status_response.json()["mode"] == "mock"
    assert status_response.json()["provider_available"] is True
    assert status_response.json()["real_certification_enabled"] is False

    plantilla = await client.post(
        "/api/recetas/plantillas",
        headers=headers,
        data={"nombre": "Receta mock", "requiere_dni": "false", "requiere_fecha_nacimiento": "false"},
        files={"archivo": ("receta-mock.png", receta_template_png(), "image/png")},
    )
    assert plantilla.status_code == 201
    receta = await client.post(
        f"/api/recetas/pacientes/{paciente_id}",
        headers=headers,
        json={
            "doctor_id": str(doctor.id),
            "plantilla_id": plantilla.json()["id"],
            "medicamento": "Amoxicilina 500 mg",
            "posologia": "1 capsula cada 8 horas.",
            "unidades": "1 envase",
            "duracion": "7 dias",
            "prescriptor_num_colegiado": "28000123",
            "prescriptor_colegio": "Colegio Madrid",
            "prescriptor_provincia": "Madrid",
        },
    )
    assert receta.status_code == 201

    enviada = await client.post(
        f"/api/recetas/{receta.json()['id']}/enviar-proveedor",
        headers=headers,
        json={"plantilla_id": plantilla.json()["id"]},
    )
    assert enviada.status_code == 200
    enviada_json = enviada.json()
    assert enviada_json["estado"] == "certificada"
    assert enviada_json["provider_mode"] == "mock"
    assert enviada_json["certificada_real"] is False
    assert enviada_json["external_id"].startswith("MOCK-RX-")
    assert enviada_json["pdf_documento_id"]

    receta_pdf = await client.get(f"/api/recetas/{receta.json()['id']}/pdf", headers=headers)
    assert_pdf_response(receta_pdf)
