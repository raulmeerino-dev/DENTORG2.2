"""Tests de la sesion clinica activa del paciente.

Cubre CRUD de items y la integracion con `historial/sesion-realizada`
para cerrar el item al finalizar como realizado.
"""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.doctor import Doctor
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"sesion-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin Sesion",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def crear_paciente_y_tratamiento(client: AsyncClient, db_session: AsyncSession, headers: dict[str, str]):
    doctor = Doctor(nombre="Dra. Sesion", color_agenda="#0891b2", activo=True)
    familia = FamiliaTratamiento(nombre="Operatoria", icono="OP", orden=4, activo=True)
    db_session.add_all([doctor, familia])
    await db_session.flush()
    tratamiento = TratamientoCatalogo(
        familia_id=familia.id,
        codigo=f"SES-{uuid4().hex[:6]}",
        nombre="Empaste sesion",
        precio=70,
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
        json={"nombre": "Mara", "apellidos": "Sesion", "telefono": "600009000"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]
    return paciente_id, str(doctor.id), str(tratamiento.id)


@pytest.mark.asyncio
async def test_sesion_clinica_crud_persiste_tras_refrescar(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    paciente_id, doctor_id, tratamiento_id = await crear_paciente_y_tratamiento(client, db_session, headers)

    creado = await client.post(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
        json={
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "titulo": "Empaste pieza 24",
            "pieza_dental": 24,
            "caras": "MOD",
            "observaciones": "Anestesia infiltrativa",
            "estado": "en_curso",
            "origen": "manual",
        },
    )
    assert creado.status_code == 201
    item = creado.json()
    assert item["pieza_dental"] == 24
    assert item["caras"] == "MOD"
    assert item["estado"] == "en_curso"
    assert item["origen"] == "manual"
    item_id = item["id"]

    listado = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
    )
    assert listado.status_code == 200
    assert any(row["id"] == item_id for row in listado.json())

    editado = await client.patch(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items/{item_id}",
        headers=headers,
        json={"observaciones": "Anestesia + matriz palodent", "estado": "pospuesto"},
    )
    assert editado.status_code == 200
    assert editado.json()["observaciones"] == "Anestesia + matriz palodent"
    assert editado.json()["estado"] == "pospuesto"

    # Segundo GET simula "refrescar pagina" — confirma persistencia
    listado_post_refresh = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
    )
    assert listado_post_refresh.status_code == 200
    found = next((row for row in listado_post_refresh.json() if row["id"] == item_id), None)
    assert found is not None
    assert found["observaciones"] == "Anestesia + matriz palodent"
    assert found["estado"] == "pospuesto"

    eliminado = await client.delete(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items/{item_id}",
        headers=headers,
    )
    assert eliminado.status_code == 204
    final = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
    )
    assert all(row["id"] != item_id for row in final.json())


@pytest.mark.asyncio
async def test_finalizar_sesion_cierra_item_y_crea_historial(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    paciente_id, doctor_id, tratamiento_id = await crear_paciente_y_tratamiento(client, db_session, headers)

    item_res = await client.post(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
        json={
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "titulo": "Empaste 36",
            "pieza_dental": 36,
            "caras": "O",
            "estado": "en_curso",
        },
    )
    assert item_res.status_code == 201
    item_id = item_res.json()["id"]

    realizado = await client.post(
        "/api/tratamientos/historial/sesion-realizada",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "sesion_item_id": item_id,
            "pieza_dental": 36,
            "caras": "O",
            "procedimiento": "Empaste pieza 36",
            "observaciones": "Composite A2",
            "origen": "manual",
            "fecha": datetime.now(timezone.utc).date().isoformat(),
        },
    )
    assert realizado.status_code == 201
    historial = realizado.json()
    assert historial["estado"] == "realizado"

    # El listado por defecto excluye realizados — el item ya no debe aparecer.
    activos = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
    )
    assert activos.status_code == 200
    assert all(row["id"] != item_id for row in activos.json())

    # Pero con incluir_realizados=true sigue trazable con su historial_id.
    completos = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
        params={"incluir_realizados": "true"},
    )
    cerrado = next(row for row in completos.json() if row["id"] == item_id)
    assert cerrado["estado"] == "realizado"
    assert cerrado["historial_id"] == historial["id"]


@pytest.mark.asyncio
async def test_no_se_puede_editar_o_eliminar_item_realizado(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    paciente_id, doctor_id, tratamiento_id = await crear_paciente_y_tratamiento(client, db_session, headers)

    item_res = await client.post(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
        json={
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "titulo": "Empaste 26",
            "pieza_dental": 26,
            "caras": "M",
            "estado": "en_curso",
        },
    )
    item_id = item_res.json()["id"]

    realizado = await client.post(
        "/api/tratamientos/historial/sesion-realizada",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "sesion_item_id": item_id,
            "pieza_dental": 26,
            "caras": "M",
            "procedimiento": "Empaste pieza 26",
            "origen": "manual",
            "fecha": datetime.now(timezone.utc).date().isoformat(),
        },
    )
    assert realizado.status_code == 201

    bloqueado_patch = await client.patch(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items/{item_id}",
        headers=headers,
        json={"observaciones": "nueva nota"},
    )
    assert bloqueado_patch.status_code == 409

    bloqueado_delete = await client.delete(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items/{item_id}",
        headers=headers,
    )
    assert bloqueado_delete.status_code == 409


@pytest.mark.asyncio
async def test_patch_rechaza_estado_realizado(client: AsyncClient, db_session: AsyncSession):
    """El PATCH no puede saltar a 'realizado': hay que usar el endpoint de finalizar."""
    headers = await auth_headers(client, db_session)
    paciente_id, doctor_id, tratamiento_id = await crear_paciente_y_tratamiento(client, db_session, headers)

    item_res = await client.post(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers,
        json={
            "tratamiento_id": tratamiento_id,
            "doctor_id": doctor_id,
            "titulo": "Empaste 46",
            "estado": "planificado",
        },
    )
    item_id = item_res.json()["id"]

    intento = await client.patch(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items/{item_id}",
        headers=headers,
        json={"estado": "realizado"},
    )
    assert intento.status_code == 400


@pytest.mark.asyncio
async def test_otra_clinica_no_ve_la_sesion(client: AsyncClient, db_session: AsyncSession):
    """RLS basico: un usuario de otra clinica no puede leer o crear items."""
    from app.models.clinica import Clinica

    clinica_a = Clinica(nombre="Clinica A", activa=True)
    clinica_b = Clinica(nombre="Clinica B", activa=True)
    db_session.add_all([clinica_a, clinica_b])
    await db_session.commit()

    admin_headers = await auth_headers(client, db_session)

    paciente_res = await client.post(
        "/api/pacientes",
        headers=admin_headers,
        json={"nombre": "Iris", "apellidos": "Privada", "clinica_id": str(clinica_a.id)},
    )
    paciente_id = paciente_res.json()["id"]

    item_res = await client.post(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=admin_headers,
        json={"titulo": "Limpieza", "estado": "planificado"},
    )
    assert item_res.status_code == 201

    # Usuario asociado a clinica B intenta listar
    username = f"docb-{uuid4().hex[:8]}"
    usuario_b = Usuario(
        username=username,
        password_hash=hash_password("usuario1234"),
        nombre="Usuario Clinica B",
        rol="doctor",
        clinica_id=clinica_b.id,
        activo=True,
    )
    db_session.add(usuario_b)
    await db_session.commit()
    login = await client.post("/api/auth/login", json={"username": username, "password": "usuario1234"})
    assert login.status_code == 200
    headers_b = {"Authorization": f"Bearer {login.json()['access_token']}"}

    listado = await client.get(
        f"/api/tratamientos/pacientes/{paciente_id}/sesion-items",
        headers=headers_b,
    )
    assert listado.status_code == 403
