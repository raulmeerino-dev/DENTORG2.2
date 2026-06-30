import { expect, test, type Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8011/api';
const patient = {
  id: 'pac-1',
  codigo: '#0091312',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '+34 600 123 456',
  telefono2: null,
  dni_nie: null,
  email: null,
  direccion: null,
  codigo_postal: null,
  ciudad: null,
  provincia: null,
  profesion: null,
  activo: true,
  observaciones: null,
  datos_salud: {},
};
const doctor = {
  id: 'doc-1',
  nombre: 'Dra. Ruiz',
  especialidad: null,
  color_agenda: '#0891a4',
  es_auxiliar: false,
  porcentaje: '35.00',
  activo: true,
};
const presupuestoLineaId = 'linea-pres-36';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function mockDentcoreApi(page: Page) {
  const citas: Array<Record<string, unknown>> = [];
  let createdPayload: Record<string, unknown> | null = null;
  let authenticated = false;

  await page.route(`${API_BASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api', '');
    const method = request.method();

    if (path === '/auth/refresh') {
      await route.fulfill(authenticated ? json({ access_token: 'e2e-token' }) : json({ detail: 'Sin sesion' }, 401));
      return;
    }
    if (path === '/auth/login' && method === 'POST') {
      authenticated = true;
      await route.fulfill(json({ access_token: 'e2e-token' }));
      return;
    }
    if (path === '/auth/me') {
      await route.fulfill(json({
        id: 'user-1',
        username: 'admin',
        nombre: 'Administrador',
        rol: 'admin',
        clinica_id: null,
        paciente_id: null,
        two_factor_enabled: true,
      }));
      return;
    }
    if (path === '/pacientes') {
      await route.fulfill(json([patient]));
      return;
    }
    if (path === `/pacientes/${patient.id}`) {
      await route.fulfill(json(patient));
      return;
    }
    if (path === '/doctores') {
      await route.fulfill(json([doctor]));
      return;
    }
    if (path === `/doctores/${doctor.id}/horarios`) {
      await route.fulfill(json(Array.from({ length: 7 }, (_, dia) => ({
        id: `hor-${dia}`,
        doctor_id: doctor.id,
        dia_semana: dia,
        tipo_dia: 'laborable',
        bloques: [{ inicio: '09:00', fin: '10:00' }],
        intervalo_min: 30,
      }))));
      return;
    }
    if (path === '/citas' && method === 'GET') {
      const pacienteId = url.searchParams.get('paciente_id');
      const doctorId = url.searchParams.get('doctor_id');
      await route.fulfill(json(citas.filter((cita) => {
        if (pacienteId && cita.paciente_id !== pacienteId) return false;
        if (doctorId && cita.doctor_id !== doctorId) return false;
        return true;
      })));
      return;
    }
    if (path === '/citas' && method === 'POST') {
      createdPayload = request.postDataJSON() as Record<string, unknown>;
      const cita = {
        id: 'cita-presupuesto-1',
        clinica_id: null,
        paciente_id: patient.id,
        doctor_id: doctor.id,
        gabinete_id: null,
        presupuesto_linea_id: createdPayload.presupuesto_linea_id ?? null,
        fecha_hora: createdPayload.fecha_hora,
        duracion_min: createdPayload.duracion_min,
        estado: 'programada',
        es_urgencia: false,
        motivo: createdPayload.motivo ?? null,
        observaciones: createdPayload.observaciones ?? null,
        recordatorio_enviado: false,
        recordatorio_canal: null,
        recordatorio_estado: null,
        recordatorio_at: null,
        confirmado_at: null,
        motivo_cancelacion: null,
        paciente: {
          id: patient.id,
          nombre: patient.nombre,
          apellidos: patient.apellidos,
          telefono: patient.telefono,
        },
        doctor: {
          id: doctor.id,
          nombre: doctor.nombre,
          color_agenda: doctor.color_agenda,
        },
      };
      citas.push(cita);
      await route.fulfill(json(cita, 201));
      return;
    }
    if (path === `/citas/${citas[0]?.id}` && method === 'PATCH') {
      const patch = request.postDataJSON() as Record<string, unknown>;
      Object.assign(citas[0], patch);
      await route.fulfill(json(citas[0]));
      return;
    }
    if (
      path === '/citas/panel/telefonear/pendientes'
      || path === '/whatsapp/comunicaciones'
      || path === '/notificaciones/mias'
      || path.startsWith('/presupuestos')
      || path.startsWith('/facturas')
      || path.startsWith('/tratamientos')
      || path.startsWith('/documentos')
      || path.startsWith('/consentimientos')
      || path.startsWith('/laboratorio')
      || path.startsWith('/recetas')
    ) {
      await route.fulfill(json([]));
      return;
    }
    if (path.endsWith('/saldo')) {
      await route.fulfill(json({ total_facturado: 0, total_cobrado: 0, pendiente: 0, facturas_pendientes: 0 }));
      return;
    }

    await route.fulfill(json([]));
  });

  return {
    getCreatedPayload: () => createdPayload,
    getCitas: () => citas,
  };
}

test('guardar, refrescar y conservar cita vinculada a linea de presupuesto', async ({ page }) => {
  const apiState = await mockDentcoreApi(page);

  await page.goto('/login');
  await page.getByLabel('Usuario').fill('admin');
  await page.locator('input[type="password"]').fill('admin1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/pacientes/);

  await page.evaluate(([pacienteId, lineaId]) => {
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.setItem('dentcore_selected_patient_id', pacienteId);
    sessionStorage.setItem('dentcore_selected_treatment', 'Endodoncia 36');
    sessionStorage.setItem('dentcore_selected_presupuesto_linea_id', lineaId);
  }, [patient.id, presupuestoLineaId]);

  await page.goto(`/agenda?fecha=${todayIso()}`);
  await expect(page.getByText('Nueva cita')).toBeVisible();
  await expect(page.getByLabel(/Tratamiento previsto/i)).toHaveValue('Endodoncia 36');

  await page.getByRole('button', { name: /Guardar cita/i }).click();
  await expect.poll(() => apiState.getCreatedPayload()?.presupuesto_linea_id).toBe(presupuestoLineaId);
  await expect(page.getByText('Cesar Gutierrez Velez').first()).toBeVisible();
  await expect(page.getByText('Endodoncia 36').first()).toBeVisible();

  await page.reload();
  await expect(page.getByText('Cesar Gutierrez Velez').first()).toBeVisible();
  await expect(page.getByText('Endodoncia 36').first()).toBeVisible();
  expect(apiState.getCitas()[0]?.presupuesto_linea_id).toBe(presupuestoLineaId);
});
