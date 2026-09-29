from uuid import uuid4

import pytest

from app.domains.clinical.persistence.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.domains.identity.persistence.doctor import Doctor
from tests.test_pacientes_citas import auth_headers


@pytest.mark.asyncio
async def test_clear_budget_piece_and_faces_preserves_other_fields_and_totals(client, db_session):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Editor presupuesto", activo=True)
    family = FamiliaTratamiento(nombre="Editor", orden=1, activo=True)
    db_session.add_all([doctor, family])
    await db_session.flush()
    treatment = TratamientoCatalogo(familia_id=family.id, codigo=f"ED-{uuid4().hex[:6]}",
                                   nombre="Tratamiento editor", precio=100, iva_porcentaje=0,
                                   requiere_pieza=False, requiere_caras=False, activo=True)
    db_session.add(treatment)
    await db_session.commit()
    patient = (await client.post('/api/pacientes', headers=headers, json={'nombre': 'Editor', 'apellidos': 'Prueba'})).json()
    response = await client.post('/api/presupuestos', headers=headers, json={
        'paciente_id': patient['id'], 'doctor_id': str(doctor.id), 'fecha': '2026-09-29',
        'lineas': [{'tratamiento_id': str(treatment.id), 'pieza_dental': 16, 'caras': 'MOD',
                    'precio_unitario': '100', 'descuento_porcentaje': '10'}],
    })
    assert response.status_code == 201, response.text
    budget = response.json()
    line = budget['lineas'][0]
    endpoint = f"/api/presupuestos/{budget['id']}/lineas/{line['id']}"
    second = await client.post(f"/api/presupuestos/{budget['id']}/lineas", headers=headers, json={
        'tratamiento_id': str(treatment.id), 'pieza_dental': 17, 'precio_unitario': '100',
    })
    assert second.status_code == 201, second.text
    changed = await client.patch(endpoint, headers=headers, json={
        'revision': line['revision'], 'pieza_dental': None, 'caras': None, 'precio_unitario': '80',
    })
    assert changed.status_code == 200, changed.text
    saved = changed.json()
    assert saved['pieza_dental'] is None
    assert saved['caras'] is None
    assert float(saved['descuento_porcentaje']) == 10
    assert float(saved['importe_neto']) == 72
    # Omitting location fields later must not restore their old values.
    changed_again = await client.patch(endpoint, headers=headers, json={'revision': saved['revision'], 'descuento_porcentaje': '0'})
    assert changed_again.status_code == 200, changed_again.text
    assert changed_again.json()['pieza_dental'] is None
    assert changed_again.json()['caras'] is None
    read = (await client.get(f"/api/presupuestos/{budget['id']}", headers=headers)).json()
    assert len(read['lineas']) == 2
    assert float(read['total']) == 180
    # Updating a row must not move it to the end of the working list.
    assert [item['id'] for item in read['lineas']] == [line['id'], second.json()['id']]
    accepted = await client.post(f"/api/presupuestos/{budget['id']}/aceptar", headers=headers, json={'pasar_a_trabajo_pendiente': True})
    assert accepted.status_code == 200, accepted.text
    locked = accepted.json()['lineas'][0]
    assert (await client.patch(endpoint, headers=headers, json={'revision': locked['revision'], 'caras': None})).status_code == 409
