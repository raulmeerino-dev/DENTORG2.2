import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.skip(process.env.DENTCORE_MULTIUSER_E2E !== '1', 'Requires isolated PostgreSQL + API + frontend');
test.setTimeout(120_000);
const apiBase = process.env.DENTCORE_E2E_API_URL ?? 'http://127.0.0.1:8012/api';

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('dos ordenadores: llegada, agenda, borrador, conflicto, reconexión y aislamiento', async ({ browser, request }, info) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(apiBase).hostname);
  const auth = await request.post(`${apiBase}/auth/login`, { data: { username: 'admin', password: 'admin1234' } });
  const token = (await auth.json()).access_token;
  async function api(path: string, method = 'GET', data?: unknown) {
    const response = await request.fetch(`${apiBase}${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() } });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
    return response.json();
  }
  const doctorAuth = await request.post(`${apiBase}/auth/login`, { data: { username: 'doctor', password: 'doctor123' } });
  expect(doctorAuth.ok()).toBeTruthy();
  const doctorToken = (await doctorAuth.json()).access_token;
  const doctorProfile = await request.get(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${doctorToken}` } });
  const doctorId = (await doctorProfile.json()).doctor_id;
  expect(doctorId).toBeTruthy();
  const name = `Realtime${Date.now()}`;
  const patient = await api('/pacientes', 'POST', { nombre: name, apellidos: 'Multiusuario', telefono: '600000000' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const existing = await api(`/citas?doctor_id=${doctorId}&fecha_desde=${today.toISOString()}&fecha_hasta=${new Date(today.getTime() + 86400000).toISOString()}`);
  const slot = Array.from({ length: 144 }, (_, i) => today.getTime() + i * 600000).find(start => existing.every((c: { fecha_hora: string; duracion_min: number; estado: string }) => ['anulada', 'falta', 'cancelled_by_patient'].includes(c.estado) || start + 600000 <= Date.parse(c.fecha_hora) || start >= Date.parse(c.fecha_hora) + c.duracion_min * 60000));
  expect(slot).toBeDefined();
  const appointment = await api('/citas', 'POST', { paciente_id: patient.id, doctor_id: doctorId, fecha_hora: new Date(slot!).toISOString(), duracion_min: 10, forzar_fuera_horario: true });
  await api(`/tratamientos/pacientes/${patient.id}/sesion-items`, 'POST', { titulo: 'Tratamiento de prueba', pieza_dental: 16, cita_id: appointment.id, doctor_id: doctorId });
  const receptionContext = await browser.newContext({ timezoneId: process.env.TZ, viewport: { width: 1440, height: 1000 } });
  const doctorContext = await browser.newContext({ timezoneId: process.env.TZ, viewport: { width: 1440, height: 1000 } });
  const reception = await receptionContext.newPage();
  const doctor = await doctorContext.newPage();
  const messages: { event?: string; id?: string; type?: string }[] = [];
  const errors: string[] = [];
  const networkErrors: string[] = [];
  for (const page of [reception, doctor]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() < 400) return;
      // Initial anonymous session recovery and the deliberately stale edit below.
      if (response.status() === 401 && response.url().endsWith('/auth/refresh')) return;
      if (response.status() === 409 && response.url().endsWith(`/pacientes/${patient.id}`)) return;
      networkErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on('websocket', ws => ws.on('framereceived', frame => {
      if (page === doctor) messages.push(JSON.parse(frame.payload.toString()));
    }));
  }
  try {
    await Promise.all([login(reception, 'recepcion', 'recep123'), login(doctor, 'doctor', 'doctor123')]);
    await expect.poll(() => messages.some(m => m.type === 'ready')).toBe(true);
    const peerRow = doctor.locator(`[data-cita-id="${appointment.id}"]`).first();
    await expect(peerRow).toBeVisible();
    await reception.locator(`[data-cita-id="${appointment.id}"]`).first().getByRole('button', { name: 'Ha llegado', exact: true }).click();
    await expect(peerRow).toContainText(/En sala|En clínica/, { timeout: 5000 });
    expect(messages.some(m => m.event === 'appointment.updated' && m.id === appointment.id)).toBe(true);
    await doctor.screenshot({ path: info.outputPath('doctor-llegada-realtime.png'), fullPage: true });

    await Promise.all([reception.goto(`/pacientes?paciente_id=${patient.id}`), doctor.goto(`/pacientes?paciente_id=${patient.id}&tab=sesion`)]);
    const note = doctor.getByRole('textbox', { name: 'Nota rapida de pieza', exact: true });
    await expect(note).toBeEnabled();
    await note.fill('Borrador clínico conservado durante actualización remota');
    await reception.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await reception.getByLabel('Teléfono', { exact: true }).fill('600123456');
    await reception.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await expect.poll(async () => (await api(`/pacientes/${patient.id}`)).telefono).toBe('600123456');
    await expect(note).toHaveValue('Borrador clínico conservado durante actualización remota');
    await doctor.getByRole('button', { name: 'Guardar nota de pieza', exact: true }).click();
    await expect.poll(async () => (await api(`/tratamientos/notas-dentales/${patient.id}`)).some((n: { texto: string }) => n.texto.includes('Borrador clínico conservado'))).toBe(true);

    // Same field: keep local input and reject the stale revision at the real API.
    await reception.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await reception.getByLabel('Teléfono', { exact: true }).fill('600222222');
    const current = await api(`/pacientes/${patient.id}`);
    await api(`/pacientes/${patient.id}`, 'PATCH', { telefono: '600333333', revision: current.revision });
    await expect(reception.getByText('Esta ficha cambió mientras la estabas editando. Tu borrador se conserva.')).toBeVisible();
    await reception.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await expect(reception.getByText(/Esta información cambió mientras/)).toBeVisible();
    await expect(reception.getByLabel('Teléfono', { exact: true })).toHaveValue('600222222');
    expect((await api(`/pacientes/${patient.id}`)).telefono).toBe('600333333');
    await reception.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await doctor.goto('/jornada?vista=agenda');
    const agendaRow = doctor.getByRole('article', { name: new RegExp(`Cita de ${name}`) });
    await expect(agendaRow).toBeVisible();
    const before = await api(`/citas/${appointment.id}`);
    const tomorrow = today.getTime() + 86400000;
    const tomorrowAppointments = await api(`/citas?doctor_id=${doctorId}&fecha_desde=${new Date(tomorrow).toISOString()}&fecha_hasta=${new Date(tomorrow + 86400000).toISOString()}`);
    const target = Array.from({ length: 144 }, (_, i) => tomorrow + i * 600000).find(start => tomorrowAppointments.every((c: { fecha_hora: string; duracion_min: number; estado: string }) => ['anulada', 'falta', 'cancelled_by_patient'].includes(c.estado) || start + 600000 <= Date.parse(c.fecha_hora) || start >= Date.parse(c.fecha_hora) + c.duracion_min * 60000));
    expect(target).toBeDefined();
    await api(`/citas/${appointment.id}`, 'PATCH', { fecha_hora: new Date(target!).toISOString(), revision: before.revision, forzar_fuera_horario: true });
    await expect(agendaRow).toHaveCount(0, { timeout: 5000 });

    // Disconnect a whole computer, change data, then resume its existing page.
    await doctor.goto(`/pacientes?paciente_id=${patient.id}`);
    await expect(doctor.getByText('600333333', { exact: true }).first()).toBeVisible();
    await doctorContext.setOffline(true);
    const offline = await api(`/pacientes/${patient.id}`);
    await api(`/pacientes/${patient.id}`, 'PATCH', { telefono: '600444444', revision: offline.revision });
    await doctorContext.setOffline(false);
    await expect(doctor.getByText('600444444', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    const otherClinic = await api('/clinicas', 'POST', { nombre: `Clínica ajena ${name}` });
    const foreign = await api('/pacientes', 'POST', { nombre: 'No transmitir', apellidos: name, clinica_id: otherClinic.id });
    // A same-transaction scoped event after the foreign one establishes delivery.
    const own = await api(`/pacientes/${patient.id}`);
    await api(`/pacientes/${patient.id}`, 'PATCH', { telefono: '600555555', revision: own.revision });
    await expect(doctor.getByText('600555555', { exact: true }).first()).toBeVisible();
    expect(messages.some(m => m.id === foreign.id)).toBe(false);
    expect(errors).toEqual([]);
    expect(networkErrors).toEqual([]);
    await doctor.screenshot({ path: info.outputPath('doctor-reconnected.png'), fullPage: true });
    await reception.screenshot({ path: info.outputPath('reception-synchronized.png'), fullPage: true });
  } finally {
    await receptionContext.close(); await doctorContext.close();
  }
});
