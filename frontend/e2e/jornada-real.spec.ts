import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Opt in only against the isolated PostgreSQL runtime documented in e2e/README.md.
// There are deliberately no route mocks: mutations and reads reach FastAPI.
test.skip(process.env.DENTCORE_REAL_E2E !== '1', 'Requires the isolated real backend');
test.setTimeout(90_000);

const apiBase = process.env.DENTCORE_E2E_API_URL ?? 'http://127.0.0.1:8011/api';
type Appointment = { id: string; paciente_id: string; doctor_id: string; fecha_hora: string; duracion_min: number; estado: string; estado_operativo: string; llegada_at: string | null; atencion_iniciada_at: string | null; finalizada_at: string | null; salida_resuelta_at: string | null; pendiente_salida: boolean };

async function api<T>(request: APIRequestContext, token: string, path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await request.fetch(`${apiBase}${path}`, { method, data, headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function tokenFor(request: APIRequestContext, username: string, password: string) {
  const response = await request.post(`${apiBase}/auth/login`, { data: { username, password } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/jornada');
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function fixture(request: APIRequestContext) {
  expect(['localhost', '127.0.0.1']).toContain(new URL(apiBase).hostname);
  const admin = await tokenFor(request, 'admin', 'admin1234');
  const doctorToken = await tokenFor(request, 'doctor', 'doctor123');
  const doctorUser = await api<{ doctor_id: string }>(request, doctorToken, '/auth/me');
  const cabinets = await api<Array<{ id: string; nombre: string; activo: boolean }>>(request, admin, '/doctores/gabinetes/');
  const cabinet = cabinets.find(item => item.activo);
  const name = `JornadaE2E${Date.now()}`;
  const patient = await api<{ id: string }>(request, admin, '/pacientes', 'POST', { nombre: name, apellidos: 'Prueba aislada', telefono: '600000000' });
  const from = new Date(`${localDate()}T00:00:00`).toISOString();
  const through = new Date(`${localDate()}T23:59:59`).toISOString();
  const appointments = await api<Appointment[]>(request, admin, `/citas?doctor_id=${doctorUser.doctor_id}&fecha_desde=${from}&fecha_hasta=${through}`);
  // Pick an actually free slot to make reruns independent, preserving all audit history.
  const slot = Array.from({ length: 72 }, (_, index) => new Date(`${localDate()}T00:00:00`).getTime() + ((index + 54) % 72) * 20 * 60_000)
    .find(start => appointments.every(cita => ['cancelada', 'no_presentado', 'finalizada'].includes(cita.estado_operativo) || start + 20 * 60_000 <= Date.parse(cita.fecha_hora) || start >= Date.parse(cita.fecha_hora) + cita.duracion_min * 60_000));
  expect(slot).toBeDefined();
  const appointment = await api<Appointment>(request, admin, '/citas', 'POST', {
    paciente_id: patient.id, doctor_id: doctorUser.doctor_id, gabinete_id: cabinet?.id, fecha_hora: new Date(slot!).toISOString(), duracion_min: 20,
    forzar_fuera_horario: true, motivo: 'Revisión de prueba E2E sin acto clínico',
  });
  return { admin, doctorToken, name, patient, appointment, doctorId: doctorUser.doctor_id, cabinet };
}

test('Jornada real: recepción → sala → atención → finalización → salida, con persistencia', async ({ browser, request }) => {
  const data = await fixture(request);
  const receptionContext = await browser.newContext({ timezoneId: process.env.TZ });
  const doctorContext = await browser.newContext({ timezoneId: process.env.TZ });
  const reception = await receptionContext.newPage();
  const doctor = await doctorContext.newPage();
  const read = () => api<Appointment>(request, data.admin, `/citas/${data.appointment.id}`);

  try {
    await login(reception, 'recepcion', 'recep123');
    await reception.getByRole('button', { name: /^Filtros/ }).click();
    await reception.getByLabel('Buscar en Jornada').fill(data.name);
    await reception.keyboard.press('Escape');
    const receptionRow = reception.locator(`[data-cita-id="${data.appointment.id}"]`).first();
    const receptionUrl = reception.url();
    await receptionRow.getByRole('button', { name: 'Ha llegado', exact: true }).click();
    await expect.poll(async () => (await read()).estado_operativo).toBe('en_sala');
    expect(reception.url()).toBe(receptionUrl);
    const arrived = await read();
    expect(arrived.llegada_at).toBeTruthy();
    // Retrying a completed arrival must preserve the time and create no duplicate alert.
    await api(request, data.admin, `/citas/${data.appointment.id}/llegada`, 'POST');
    expect((await read()).llegada_at).toBe(arrived.llegada_at);
    const notifications = await api<Array<{ appointment_id: string }>>(request, data.doctorToken, '/notificaciones/mias');
    expect(notifications.filter(item => item.appointment_id === data.appointment.id)).toHaveLength(1);

    await login(doctor, 'doctor', 'doctor123');
    await doctor.getByRole('button', { name: /^En sala \d/ }).click();
    const waiting = doctor.getByRole('dialog', { name: 'En sala', exact: true }).locator('article').filter({ hasText: data.name });
    if (data.cabinet) await expect(waiting).toContainText(data.cabinet.nombre);
    await waiting.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
    await expect(doctor).toHaveURL(new RegExp(`paciente_id=${data.patient.id}`));
    expect((await read()).estado_operativo).toBe('en_sala');

    await doctor.getByRole('button', { name: /^En sala \d/ }).click();
    await waiting.getByRole('button', { name: 'Atender', exact: true }).click();
    await expect.poll(async () => (await read()).estado_operativo).toBe('en_atencion');
    await expect(doctor).toHaveURL(/tab=sesion/);
    await doctor.getByRole('button', { name: 'Finalizar visita', exact: true }).click();
    await doctor.getByRole('dialog', { name: 'Finalizar visita clínica' }).getByRole('button', { name: 'Confirmar finalización de visita' }).click();
    await expect.poll(async () => (await read()).estado_operativo).toBe('finalizada');
    expect((await read()).pendiente_salida).toBe(true);
    await doctor.getByRole('button', { name: /^En sala \d/ }).click();
    await expect(doctor.getByRole('dialog', { name: 'En sala', exact: true }).locator(`[data-cita-id="${data.appointment.id}"]`)).toHaveCount(0);

    await reception.reload();
    await reception.getByRole('button', { name: /^Filtros/ }).click();
    await reception.getByLabel('Buscar en Jornada').fill(data.name);
    await reception.keyboard.press('Escape');
    await reception.getByRole('region', { name: 'Pendiente de salida' }).locator(`[data-cita-id="${data.appointment.id}"]`).getByRole('button', { name: 'Resolver salida', exact: true }).click();
    await reception.getByRole('dialog', { name: 'Resolver salida' }).getByRole('button', { name: 'Confirmar salida revisada' }).click();
    await expect.poll(async () => (await read()).pendiente_salida).toBe(false);
    const finished = await read();
    expect(finished.estado_operativo).toBe('finalizada');
    expect(finished.salida_resuelta_at).toBeTruthy();
    expect(finished.llegada_at).toBe(arrived.llegada_at);

    await reception.reload();
    expect((await read()).pendiente_salida).toBe(false);
    const changes = await api<Array<{ accion: string }>>(request, data.admin, `/citas/${data.appointment.id}/cambios`);
    expect(changes.length).toBeGreaterThanOrEqual(5);
  } finally {
    await receptionContext.close();
    await doctorContext.close();
  }
});

test('Jornada conserva filtros al cambiar Operativa / Agenda y al recargar', async ({ page, request }) => {
  const data = await fixture(request);
  await login(page, 'recepcion', 'recep123');
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByLabel('Profesional de Jornada').selectOption(data.doctorId);
  await page.getByLabel('Estado de Jornada').selectOption('programada');
  await page.getByLabel('Buscar en Jornada').fill(data.name);
  await page.keyboard.press('Escape');
  const perspectives = page.getByRole('navigation', { name: 'Perspectiva de Jornada' });
  await perspectives.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByLabel('Profesional de Agenda')).toHaveValue(data.doctorId);
  await expect(page.getByLabel('Buscar en Jornada')).toHaveValue(data.name);
  await page.reload();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByLabel('Estado de Jornada')).toHaveValue('programada');
  await page.keyboard.press('Escape');
  await page.getByLabel('Mes de Agenda', { exact: true }).selectOption('1');
  await page.getByLabel('Año de Agenda', { exact: true }).selectOption('2028');
  await expect(page).toHaveURL(/fecha=2028-02-/);
  await expect(page.getByLabel('Profesional de Agenda')).toHaveValue(data.doctorId);
  await expect(page.getByLabel('Buscar en Jornada')).toHaveValue(data.name);
  await page.locator('.agenda-date-picker').getByRole('button', { name: 'Hoy', exact: true }).click();
  await perspectives.getByRole('button', { name: 'Operativa', exact: true }).click();
  await expect(page.locator(`[data-cita-id="${data.appointment.id}"]`).first()).toBeVisible();
  expect((await api<Appointment>(request, data.admin, `/citas/${data.appointment.id}`)).estado).toBe('programada');
});

test('Agenda real crea provisional sin teléfono y registra un solape urgente autorizado', async ({ page, request }) => {
  const data = await fixture(request);
  await login(page, 'recepcion', 'recep123');
  await page.getByRole('button', { name: 'Nueva cita', exact: true }).first().click();
  const modal = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await expect(modal).toBeVisible();
  if (await modal.getByRole('button', { name: 'Cambiar paciente' }).isVisible()) {
    await modal.getByRole('button', { name: 'Cambiar paciente' }).click();
  }
  await modal.getByRole('button', { name: 'Crear paciente provisional' }).click();
  const provisionalName = `UrgenciaE2E${Date.now()}`;
  await modal.getByLabel('Nombre del paciente provisional', { exact: true }).fill(provisionalName);
  await modal.getByRole('button', { name: 'Apuntar', exact: true }).click();
  await expect(modal.getByText(provisionalName, { exact: false }).first()).toBeVisible();
  if (await modal.getByRole('button', { name: 'Cambiar horario' }).isVisible()) {
    await modal.getByRole('button', { name: 'Cambiar horario' }).click();
  }
  const slot = new Date(data.appointment.fecha_hora);
  const clock = `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`;
  await modal.getByLabel('Fecha', { exact: true }).fill(localDate());
  await modal.getByLabel('Hora inicio', { exact: true }).fill(clock);
  await modal.getByRole('combobox', { name: 'Profesional', exact: true }).selectOption(data.doctorId);
  await modal.getByLabel('Duración (minutos)').fill('20');
  await modal.getByLabel('Tratamiento previsto').fill('Urgencia de prueba: evaluación');
  await expect(modal.getByRole('alert').filter({ hasText: 'Solape con' })).toBeVisible();
  await modal.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  await expect(modal.getByRole('alert').filter({ hasText: 'El horario tiene solapes' })).toBeVisible();
  await modal.getByLabel('Urgencia', { exact: true }).check();
  await modal.getByLabel('Autorizar solape de urgencia', { exact: true }).check();
  await modal.getByLabel('Motivo del solape', { exact: true }).fill('Solape autorizado exclusivamente para prueba aislada');
  const savedResponse = page.waitForResponse(response => response.url() === `${apiBase}/citas` && response.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  const response = await savedResponse;
  expect(response.status(), await response.text()).toBe(201);
  const saved = await response.json() as Appointment & { es_urgencia: boolean; solape_urgencia: boolean };
  expect(saved.es_urgencia).toBe(true);
  expect(saved.solape_urgencia).toBe(true);
  expect(saved.paciente_id).not.toBe(data.patient.id);
  await expect(modal).not.toBeVisible();
  const patient = await api<{ nombre: string; telefono: string | null }>(request, data.admin, `/pacientes/${saved.paciente_id}`);
  expect(patient.nombre).toBe(provisionalName);
  expect(patient.telefono).toBeFalsy();
  const changes = await api<Array<{ motivo: string; datos: unknown }>>(request, data.admin, `/citas/${saved.id}/cambios`);
  expect(changes.some(change => change.motivo === 'Solape autorizado exclusivamente para prueba aislada')).toBe(true);
  await page.reload();
  expect((await api<{ solape_urgencia: boolean }>(request, data.admin, `/citas/${saved.id}`)).solape_urgencia).toBe(true);
});

test('Agenda crea desde un hueco sin volver a pedir profesional ni hora', async ({ page, request }) => {
  const data = await fixture(request);
  await login(page, 'recepcion', 'recep123');
  await page.getByRole('navigation', { name: 'Perspectiva de Jornada' }).getByRole('button', { name: 'Agenda', exact: true }).click();
  const cell = page.locator(`.agenda-resource-cell:not(.outside-hours)[data-doctor-id="${data.doctorId}"]`)
    .filter({ has: page.getByRole('button', { name: /^Nueva cita \d/ }) }).first();
  await expect(cell).toBeVisible();
  const slot = await cell.getAttribute('data-slot');
  await cell.getByRole('button', { name: /^Nueva cita \d/ }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await expect(modal.getByRole('button', { name: 'Cambiar horario' })).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'Profesional', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('textbox', { name: 'Hora inicio', exact: true })).toHaveCount(0);
  await expect(modal.locator('.appointment-known-context').filter({ hasText: slot! })).toBeVisible();
  if (await modal.getByRole('button', { name: 'Cambiar paciente' }).isVisible()) {
    await modal.getByRole('button', { name: 'Cambiar paciente' }).click();
  }
  await modal.getByLabel('Buscar paciente', { exact: true }).fill(data.name);
  await modal.getByRole('combobox', { name: 'Paciente', exact: true }).selectOption(data.patient.id);
  await modal.getByRole('spinbutton', { name: /^Duración/ }).fill('5');
  await modal.getByLabel('Tratamiento previsto').fill('Control breve de prueba');
  const savedResponse = page.waitForResponse(response => response.url() === `${apiBase}/citas` && response.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  const response = await savedResponse;
  expect(response.status(), await response.text()).toBe(201);
  const saved = await response.json() as Appointment;
  expect(saved.doctor_id).toBe(data.doctorId);
  expect(saved.fecha_hora.slice(0, 10)).toBe(localDate());
  const scheduled = new Date(saved.fecha_hora);
  expect(`${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`).toBe(slot);
  expect(saved.paciente_id).toBe(data.patient.id);
  await expect(modal).not.toBeVisible();
});
