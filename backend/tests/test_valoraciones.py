from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.core.persistence.audit_log import AuditLog
from app.domains.billing.persistence.cuenta import CargoPaciente
from app.domains.billing.persistence.factura import Factura
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.identity.persistence.clinica import Clinica
from app.domains.scheduling.persistence.cita import Cita
from app.domains.treatment_plans.persistence.presupuesto import Presupuesto
from tests.test_pacientes_citas import auth_headers, auth_headers_for_user


def assessment(revision, tipo='posterior', **datos):
    return {'id': str(uuid4()), 'revision': revision, 'tipo': tipo,
            'datos': {'fecha': '2026-09-29', 'motivo': 'Valoración de prueba', **datos}}


@pytest.mark.asyncio
async def test_assessments_preserve_initial_and_do_not_create_other_entities(client, db_session):
    headers = await auth_headers(client, db_session)
    initial = {'fecha': '2024-01-03', 'motivo': 'Primera visita antigua', 'observaciones_boca': 'Texto conservado', 'relacion_legacy': 'sin cambios'}
    response = await client.post('/api/pacientes', headers=headers, json={
        'nombre': 'Diagnóstico', 'apellidos': 'Test',
        'datos_salud': {'primera_visita': initial, 'alergias': 'Nota existente'},
    })
    patient = response.json()
    endpoint = f"/api/tratamientos/pacientes/{patient['id']}/valoraciones"
    before = {model: await db_session.scalar(select(func.count()).select_from(model))
              for model in (HistorialClinico, Cita, Factura, Presupuesto, CargoPaciente)}
    command = assessment(patient['revision'])
    saved = await client.post(endpoint, headers=headers, json=command)
    assert saved.status_code == 201, saved.text
    health = saved.json()['datos_salud']
    assert health['primera_visita'] == initial
    assert health['alergias'] == 'Nota existente'
    assert len(health['valoraciones']) == 1
    assert health['valoraciones'][0]['autor']
    assert health['valoraciones'][0]['registrada_at']
    # Stable draft ID also protects retries using a fresh HTTP idempotency key.
    replay = await client.post(endpoint, headers=headers, json=command)
    assert replay.status_code == 201, replay.text
    assert len(replay.json()['datos_salud'] ['valoraciones']) == 1
    rejected = await client.post(endpoint, headers=headers, json=assessment(saved.json()['revision'], 'inicial'))
    assert rejected.status_code == 409
    stale = await client.post(endpoint, headers=headers, json=assessment(patient['revision']))
    assert stale.status_code == 409
    for model, count in before.items():
        assert await db_session.scalar(select(func.count()).select_from(model)) == count
    assert await db_session.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.accion == 'valoracion_registrada', AuditLog.registro_id == patient['id'],
    )) == 1


@pytest.mark.asyncio
async def test_initial_is_explicit_and_validated(client, db_session):
    headers = await auth_headers(client, db_session)
    patient = (await client.post('/api/pacientes', headers=headers, json={'nombre': 'Sin valoración', 'apellidos': 'Test'})).json()
    endpoint = f"/api/tratamientos/pacientes/{patient['id']}/valoraciones"
    read = await client.get(f"/api/pacientes/{patient['id']}", headers=headers)
    assert not (read.json().get('datos_salud') or {}).get('primera_visita')
    empty = assessment(patient['revision'], 'inicial', motivo='')
    assert (await client.post(endpoint, headers=headers, json=empty)).status_code == 422
    arbitrary = assessment(patient['revision'], 'inicial', cargo=99)
    assert (await client.post(endpoint, headers=headers, json=arbitrary)).status_code == 422
    saved = await client.post(endpoint, headers=headers, json=assessment(patient['revision'], 'inicial'))
    assert saved.status_code == 201, saved.text
    assert saved.json()['datos_salud']['primera_visita']['tipo'] == 'inicial'
    assert 'valoraciones' not in saved.json()['datos_salud']


@pytest.mark.asyncio
async def test_assessment_obeys_existing_clinical_access_and_tenant_scope(client, db_session):
    admin = await auth_headers(client, db_session)
    clinic_a = Clinica(nombre='Diagnóstico A')
    clinic_b = Clinica(nombre='Diagnóstico B')
    db_session.add_all([clinic_a, clinic_b])
    await db_session.commit()
    patient = (await client.post('/api/pacientes', headers=admin, json={
        'nombre': 'Clínica A', 'apellidos': 'Test', 'clinica_id': str(clinic_a.id),
    })).json()
    endpoint = f"/api/tratamientos/pacientes/{patient['id']}/valoraciones"
    other = await auth_headers_for_user(client, db_session, rol='doctor', clinica_id=clinic_b.id)
    assert (await client.post(endpoint, headers=other, json=assessment(patient['revision'], 'inicial'))).status_code == 403
    reception = await auth_headers_for_user(client, db_session, rol='recepcion', clinica_id=clinic_a.id)
    assert (await client.post(endpoint, headers=reception, json=assessment(patient['revision'], 'inicial'))).status_code == 403
