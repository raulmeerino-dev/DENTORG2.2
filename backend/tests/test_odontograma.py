from datetime import date
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.documento import DocumentoPaciente
from app.models.doctor import Doctor
from app.models.factura import FormaPago
from app.models.historial import HistorialClinico
from app.models.presupuesto import Presupuesto, PresupuestoLinea
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario


async def auth_headers(client: AsyncClient, db_session: AsyncSession, *, rol: str = "admin") -> dict[str, str]:
    username = f"odontograma-{rol}-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("usuario1234"),
        nombre="Usuario Odontograma",
        rol=rol,
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "usuario1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_odontograma_guarda_piezas_superficies_y_crea_presupuesto(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Odontograma", color_agenda="#0f766e", activo=True)
    familia = FamiliaTratamiento(nombre="Endodoncia", icono="EN", orden=1)
    forma_pago = FormaPago(nombre="Efectivo", activo=True)
    db_session.add_all([doctor, familia, forma_pago])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo="EN999",
        nombre="Endodoncia prueba",
        precio=150,
        requiere_pieza=True,
        requiere_caras=False,
    )
    db_session.add(tratamiento)
    await db_session.commit()

    paciente_response = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Odonto", "apellidos": "Paciente", "telefono": "600123123"},
    )
    assert paciente_response.status_code == 201
    paciente_id = paciente_response.json()["id"]

    created = await client.post(f"/api/pacientes/{paciente_id}/odontograma", headers=headers)
    assert created.status_code == 201
    odontograma_id = created.json()["id"]

    piece = await client.patch(
        f"/api/odontogramas/{odontograma_id}/piezas/24",
        headers=headers,
        json={"estado_general": "caries", "notas": "Dolor a frio"},
    )
    assert piece.status_code == 200
    assert piece.json()["estado_general"] == "caries"

    invalid_piece = await client.patch(
        f"/api/odontogramas/{odontograma_id}/piezas/55",
        headers=headers,
        json={"estado_general": "caries"},
    )
    assert invalid_piece.status_code == 422

    recepcion_headers = await auth_headers(client, db_session, rol="recepcion")
    forbidden_clinical_change = await client.patch(
        f"/api/odontogramas/{odontograma_id}/piezas/24/superficies/mesial",
        headers=recepcion_headers,
        json={"condicion": "caries"},
    )
    assert forbidden_clinical_change.status_code == 403

    surface = await client.patch(
        f"/api/odontogramas/{odontograma_id}/piezas/24/superficies/lingual_palatina",
        headers=headers,
        json={
            "condicion": "tratamiento_pendiente",
            "tratamiento_planificado_id": str(tratamiento.id),
            "color_estado": "#facc15",
            "notas": "Planificar endodoncia",
        },
    )
    assert surface.status_code == 200
    assert surface.json()["superficie"] == "lingual_palatina"
    assert surface.json()["tratamiento_planificado_id"] == str(tratamiento.id)

    stored = await client.get(f"/api/pacientes/{paciente_id}/odontograma", headers=headers)
    assert stored.status_code == 200
    pieza_24 = next(item for item in stored.json()["piezas"] if item["pieza_fdi"] == 24)
    assert pieza_24["superficies"][0]["condicion"] == "tratamiento_pendiente"

    diagnostico_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=diagnostico",
        headers=headers,
    )
    assert diagnostico_contexto.status_code == 200
    pieza_contexto = diagnostico_contexto.json()["teeth"]["24"]
    assert pieza_contexto["base"]["estado_general"] == "caries"
    assert pieza_contexto["surfaces"]["lingual_palatina"]["diagnostico"] == "tratamiento_pendiente"

    presupuesto_response = await client.post(
        f"/api/odontogramas/{odontograma_id}/generar-presupuesto",
        headers=headers,
        json={"doctor_id": str(doctor.id)},
    )
    assert presupuesto_response.status_code == 201
    assert presupuesto_response.json()["lineas_creadas"] == 1

    presupuesto_id = presupuesto_response.json()["presupuesto_id"]
    result = await db_session.execute(
        select(Presupuesto)
        .join(PresupuestoLinea)
        .where(Presupuesto.id == presupuesto_id, PresupuestoLinea.pieza_dental == 24)
    )
    assert result.scalar_one_or_none() is not None

    presupuesto_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=presupuesto&context_id={presupuesto_id}",
        headers=headers,
    )
    assert presupuesto_contexto.status_code == 200
    presupuesto_surface = presupuesto_contexto.json()["teeth"]["24"]["surfaces"]["lingual_palatina"]
    assert presupuesto_surface["context_state"] == "propuesto_presupuesto"
    assert presupuesto_surface["label"] == "Endodoncia prueba"
    assert presupuesto_surface["presupuesto_linea_id"]
    stored_after_budget = await client.get(f"/api/pacientes/{paciente_id}/odontograma", headers=headers)
    stored_budget_surface = next(
        item for item in stored_after_budget.json()["piezas"]
        if item["pieza_fdi"] == 24
    )["superficies"][0]
    assert stored_budget_surface["condicion"] == "tratamiento_presupuestado"

    lectura_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=lectura",
        headers=headers,
    )
    assert lectura_contexto.status_code == 200
    assert lectura_contexto.json()["mode"] == "lectura"

    accepted = await client.post(f"/api/presupuestos/{presupuesto_id}/aceptar", headers=headers, json={})
    assert accepted.status_code == 200

    pendiente_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=pendiente",
        headers=headers,
    )
    assert pendiente_contexto.status_code == 200
    pendiente_surface = pendiente_contexto.json()["teeth"]["24"]["surfaces"]["lingual_palatina"]
    assert pendiente_surface["context_state"] == "tratamiento_pendiente"
    stored_after_accept = await client.get(f"/api/pacientes/{paciente_id}/odontograma", headers=headers)
    stored_pending_surface = next(
        item for item in stored_after_accept.json()["piezas"]
        if item["pieza_fdi"] == 24
    )["superficies"][0]
    assert stored_pending_surface["condicion"] == "tratamiento_pendiente"

    pending_list = await client.get(f"/api/presupuestos/trabajo-pendiente/{paciente_id}", headers=headers)
    assert pending_list.status_code == 200
    realizado = await client.patch(
        f"/api/presupuestos/trabajo-pendiente/{pending_list.json()[0]['id']}/realizar",
        headers=headers,
    )
    assert realizado.status_code == 200
    assert realizado.json()["historial_id"]
    realizado_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=realizado",
        headers=headers,
    )
    assert realizado_contexto.status_code == 200
    realizado_surface = realizado_contexto.json()["teeth"]["24"]["surfaces"]["lingual_palatina"]
    assert realizado_surface["diagnostico"] == "tratamiento_realizado"
    assert realizado_surface["historial_id"] == realizado.json()["historial_id"]

    db_session.add(DocumentoPaciente(
        paciente_id=UUID(paciente_id),
        nombre_original="rx-24.pdf",
        nombre_guardado="rx-24.pdf",
        ruta="pacientes/test/rx-24.pdf",
        mime_type="application/pdf",
        tamano_bytes=128,
        categoria="radiografia",
        descripcion="Radiografia de control pieza 24",
        historial_id=UUID(realizado.json()["historial_id"]),
        tratamiento_id=tratamiento.id,
    ))
    await db_session.commit()
    documentos_contexto = await client.get(
        f"/api/pacientes/{paciente_id}/odontograma/contexto?mode=documentos",
        headers=headers,
    )
    assert documentos_contexto.status_code == 200
    documento_surface = documentos_contexto.json()["teeth"]["24"]["surfaces"]["lingual_palatina"]
    assert documento_surface["context_state"] == "documento_asociado"
    assert documento_surface["documentos"][0]["nombre"] == "rx-24.pdf"

    factura_response = await client.post(
        f"/api/presupuestos/{presupuesto_id}/convertir-a-factura",
        headers=headers,
        json={"serie": "A", "fecha": date.today().isoformat(), "forma_pago_id": str(forma_pago.id), "solo_aceptadas": True},
    )
    assert factura_response.status_code == 201
    factura_id = factura_response.json()["id"]
    assert factura_response.json()["estado"] == "emitida"
    assert factura_response.json()["huella"]
    historial_facturado = await db_session.get(HistorialClinico, UUID(realizado.json()["historial_id"]))
    assert historial_facturado is not None
    assert historial_facturado.factura_id == UUID(factura_id)

    cobro_response = await client.post(
        f"/api/facturas/{factura_id}/cobros",
        headers=headers,
        json={"importe": "150.00", "forma_pago_id": str(forma_pago.id), "notas": "Cobro completo"},
    )
    assert cobro_response.status_code == 201
    assert cobro_response.json()["estado"] == "pagada"
    cobro_id = cobro_response.json()["cobros"][0]["id"]

    anular_cobro = await client.post(
        f"/api/facturas/{factura_id}/cobros/{cobro_id}/anular",
        headers=headers,
        json={"motivo": "Prueba de anulacion trazable"},
    )
    assert anular_cobro.status_code == 204
    factura_tras_anular_cobro = await client.get(f"/api/facturas/{factura_id}", headers=headers)
    assert factura_tras_anular_cobro.status_code == 200
    assert factura_tras_anular_cobro.json()["estado"] == "emitida"
    assert factura_tras_anular_cobro.json()["cobros"][0]["anulado_at"]

    anular_factura = await client.delete(f"/api/facturas/{factura_id}", headers=headers)
    assert anular_factura.status_code == 204
    factura_anulada = await client.get(f"/api/facturas/{factura_id}", headers=headers)
    assert factura_anulada.status_code == 200
    assert factura_anulada.json()["estado"] == "anulada"

    duplicated_items = await client.post(
        f"/api/odontogramas/{odontograma_id}/generar-presupuesto",
        headers=headers,
        json={
            "doctor_id": str(doctor.id),
            "items": [
                {
                    "pieza_fdi": 26,
                    "superficie": "mesial",
                    "tratamiento_id": str(tratamiento.id),
                    "precio_unitario": "150.00",
                },
                {
                    "pieza_fdi": 26,
                    "superficie": "mesial",
                    "tratamiento_id": str(tratamiento.id),
                    "precio_unitario": "150.00",
                },
            ],
        },
    )
    assert duplicated_items.status_code == 201
    assert duplicated_items.json()["lineas_creadas"] == 1
    stored_after_explicit_items = await client.get(f"/api/pacientes/{paciente_id}/odontograma", headers=headers)
    piece_26 = next(
        item for item in stored_after_explicit_items.json()["piezas"]
        if item["pieza_fdi"] == 26
    )
    surface_26_mesial = next(item for item in piece_26["superficies"] if item["superficie"] == "mesial")
    assert surface_26_mesial["condicion"] == "tratamiento_presupuestado"
    assert surface_26_mesial["presupuesto_linea_id"]

    already_linked_items = await client.post(
        f"/api/odontogramas/{odontograma_id}/generar-presupuesto",
        headers=headers,
        json={
            "doctor_id": str(doctor.id),
            "items": [
                {
                    "pieza_fdi": 26,
                    "superficie": "mesial",
                    "tratamiento_id": str(tratamiento.id),
                    "precio_unitario": "150.00",
                },
            ],
        },
    )
    assert already_linked_items.status_code == 409

    legacy_surface = await client.patch(
        f"/api/odontograma/{odontograma_id}/pieza/25/superficie/lingual_palatal",
        headers=headers,
        json={"condicion": "protesis"},
    )
    assert legacy_surface.status_code == 200
    assert legacy_surface.json()["superficie"] == "lingual_palatina"

    historial = await client.get(f"/api/odontogramas/{odontograma_id}/historial", headers=headers)
    assert historial.status_code == 200
    actions = {item["accion"] for item in historial.json()}
    assert {
        "actualizar_pieza",
        "actualizar_superficie",
        "crear_presupuesto_desde_plan",
        "vincular_linea_presupuesto",
    } <= actions
