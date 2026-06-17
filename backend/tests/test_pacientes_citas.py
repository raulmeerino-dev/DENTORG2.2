from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.cita import Cita
from app.models.clinica import Clinica
from app.models.consentimiento import Consentimiento
from app.models.doctor import Doctor
from app.models.documento import DocumentoPaciente
from app.models.factura import Cobro, Factura, FormaPago
from app.models.historial import HistorialClinico
from app.models.horario import HorarioDoctor
from app.models.paciente import Paciente
from app.models.presupuesto import Presupuesto
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario
from app.services.audit import write_audit_log


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
        json={"nombre": "Ana", "apellidos": "Dental", "telefono": "600000000"},
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

    docs = await client.get("/api/portal/documentos", headers=headers, params=params)
    assert docs.status_code == 200
    assert docs.json()[0]["nombre_original"] == "informe.pdf"

    consentimientos = await client.get("/api/portal/consentimientos", headers=headers, params=params)
    assert consentimientos.status_code == 200
    assert consentimientos.json()[0]["estado"] == "pendiente_firma"

    firma_png_1x1 = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    )
    firmado = await client.post(
        f"/api/portal/consentimientos/{consentimiento.id}/firmar",
        headers=headers,
        params=params,
        json={"firma_paciente_base64": firma_png_1x1},
    )
    assert firmado.status_code == 200
    assert firmado.json()["estado"] == "firmado"


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

    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lpVL1wAAAABJRU5ErkJggg=="
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
    assert any(item["presupuesto_linea_id"] == linea_id for item in pendientes.json())

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

    pago = await client.post(
        f"/api/facturas/{factura['id']}/pagos",
        headers=headers,
        json={"forma_pago_id": str(forma_pago.id), "importe": "390.00"},
    )
    assert pago.status_code == 201
    assert pago.json()["estado"] == "pagada"

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

    verified = await client.get(f"/api/admin/backups/{backup['id']}/verificar", headers=headers)
    assert verified.status_code == 200
    assert verified.json()["ok"] is True
