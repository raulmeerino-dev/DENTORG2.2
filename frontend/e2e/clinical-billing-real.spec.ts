import { expect, test, type APIRequestContext } from '@playwright/test';

// Explicit opt-in. Every clinical/economic action below goes through the browser
// and the real local API; setup only creates synthetic patient/payment fixtures.
test.skip(process.env.DENTCORE_REAL_E2E !== '1', 'Requires isolated real backend');
test.setTimeout(120_000);
test.use({ actionTimeout: 15_000, viewport: { width: 1280, height: 720 } });
const apiBase = process.env.DENTCORE_E2E_API_URL ?? 'http://127.0.0.1:8011/api';

async function api<T>(request: APIRequestContext, token: string, path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await request.fetch(`${apiBase}${path}`, { method, data, headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

test('Circuito real: presupuesto → aceptación → cita → sesión → realizado → factura → cobro', async ({ page, request }) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(apiBase).hostname);
  const auth = await request.post(`${apiBase}/auth/login`, { data: { username: 'admin', password: 'admin1234' } });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).access_token as string;
  const name = `CircuitoE2E${Date.now()}`;
  const patient = await api<{ id: string }>(request, token, '/pacientes', 'POST', { nombre: name, apellidos: 'Prueba aislada', telefono: '600000001' });
  const paymentMethods = await api<Array<{ id: string }>>(request, token, '/facturas/formas-pago');
  if (!paymentMethods.length) await api(request, token, '/facturas/formas-pago', 'POST', { nombre: 'Efectivo de prueba' });

  await page.goto('/login');
  await page.getByLabel('Usuario').fill('admin');
  await page.locator('input[type="password"]').fill('admin1234');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(`/pacientes?paciente_id=${patient.id}`);
  const createdBudget = page.waitForResponse(response => response.url() === `${apiBase}/presupuestos` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Nuevo presupuesto', exact: true }).click();
  const budgetResponse = await createdBudget;
  expect(budgetResponse.status()).toBe(201);
  const budget = await budgetResponse.json() as { id: string; doctor_id: string };
  const budgetPanel = page.locator('.budget-panel');
  await budgetPanel.getByPlaceholder('Buscar tratamiento', { exact: true }).fill('Empaste');
  await budgetPanel.getByRole('listbox', { name: 'Tratamientos del presupuesto' }).getByRole('button').filter({ has: page.getByText('Empaste', { exact: true }) }).click();
  await budgetPanel.getByLabel('Pieza', { exact: true }).fill('36');
  await budgetPanel.getByLabel('Caras', { exact: true }).fill('O');
  await budgetPanel.getByLabel('Precio', { exact: true }).fill('75');
  await budgetPanel.getByRole('button', { name: 'Anadir', exact: true }).click();
  await expect(budgetPanel.getByRole('button', { name: 'Aceptar todo', exact: true })).toBeEnabled();
  await budgetPanel.getByRole('button', { name: 'Aceptar todo', exact: true }).click();
  type Budget = { estado: string; lineas: Array<{ id: string; aceptado: boolean; pasado_trabajo_pendiente: boolean }> };
  const readBudget = () => api<Budget>(request, token, `/presupuestos/${budget.id}`);
  await expect.poll(async () => (await readBudget()).estado).toBe('aceptado');
  const line = (await readBudget()).lineas[0];
  expect(line.aceptado).toBe(true);
  expect(line.pasado_trabajo_pendiente).toBe(true);

  // A free slot makes reruns preserve, rather than reset, the audit trail.
  type Appointment = { id: string; doctor_id: string; fecha_hora: string; duracion_min: number; estado_operativo: string; presupuesto_linea_id: string; pendiente_salida: boolean };
  const appointments = await api<Appointment[]>(request, token, `/citas?doctor_id=${budget.doctor_id}&fecha_desde=${localDate()}T00:00:00&fecha_hasta=${localDate()}T23:59:59`);
  const slot = Array.from({ length: 66 }, (_, index) => new Date(`${localDate()}T09:00:00`).getTime() + index * 10 * 60_000)
    .find(start => appointments.every(cita => start + 10 * 60_000 <= Date.parse(cita.fecha_hora) || start >= Date.parse(cita.fecha_hora) + cita.duracion_min * 60_000));
  expect(slot).toBeDefined();
  await page.goto(`/pacientes?paciente_id=${patient.id}`);
  await page.getByRole('button', { name: 'Tratamientos', exact: true }).click();
  await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
  await page.getByRole('table').getByRole('button', { name: 'Dar cita', exact: true }).click();
  const appointmentDialog = page.getByRole('dialog', { name: 'Nueva cita', exact: true });
  await expect(appointmentDialog).toBeVisible();
  if (await appointmentDialog.getByRole('button', { name: 'Cambiar horario' }).isVisible()) await appointmentDialog.getByRole('button', { name: 'Cambiar horario' }).click();
  await appointmentDialog.getByLabel('Fecha', { exact: true }).fill(localDate());
  const time = new Date(slot!);
  await appointmentDialog.getByLabel('Hora inicio', { exact: true }).fill(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
  await appointmentDialog.getByRole('combobox', { name: 'Profesional', exact: true }).selectOption(budget.doctor_id);
  await appointmentDialog.getByLabel('Duración (minutos)').fill('10');
  const createdAppointment = page.waitForResponse(response => response.url() === `${apiBase}/citas` && response.request().method() === 'POST');
  await appointmentDialog.getByRole('button', { name: 'Guardar cita', exact: true }).click();
  const appointmentResponse = await createdAppointment;
  expect(appointmentResponse.status(), await appointmentResponse.text()).toBe(201);
  const appointment = await appointmentResponse.json() as Appointment;
  expect(appointment.presupuesto_linea_id).toBe(line.id);

  await page.goto(`/jornada?vista=operativa&fecha=${localDate()}`);
  await page.getByLabel('Buscar en Jornada').fill(name);
  const row = page.locator(`[data-cita-id="${appointment.id}"]`).first();
  await row.getByRole('button', { name: 'Ha llegado', exact: true }).click();
  await row.getByRole('button', { name: 'Atender', exact: true }).click();
  await expect(page).toHaveURL(/tab=sesion/);
  await expect(page.getByLabel('Pieza FDI')).toHaveValue('36');
  await expect(page.getByLabel('Caras', { exact: true })).toHaveValue('O');
  await page.getByLabel('Observacion clinica del tratamiento').fill('Registro sintético de control E2E.');
  await page.getByLabel('Observacion clinica del tratamiento').blur();
  const completedTreatment = page.waitForResponse(response => response.url() === `${apiBase}/tratamientos/historial/sesion-realizada` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Finalizar como realizado', exact: true }).click();
  const clinicalResponse = await completedTreatment;
  expect(clinicalResponse.status(), await clinicalResponse.text()).toBe(201);
  const clinical = await clinicalResponse.json() as { id: string; cita_id: string; presupuesto_linea_id: string; estado: string };
  expect(clinical.cita_id).toBe(appointment.id);
  expect(clinical.presupuesto_linea_id).toBe(line.id);
  expect(clinical.estado).toBe('realizado');
  await page.getByRole('button', { name: 'Finalizar visita', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finalizar visita clínica' }).getByRole('button', { name: 'Confirmar finalización de visita' }).click();
  await expect.poll(async () => (await api<Appointment>(request, token, `/citas/${appointment.id}`)).pendiente_salida).toBe(true);

  // Invoice the accepted/performed plan using the existing budget action.
  await page.goto(`/pacientes?paciente_id=${patient.id}`);
  await page.getByRole('button', { name: /^Presupuestos 1$/ }).click();
  const createdInvoice = page.waitForResponse(response => response.url().includes(`/presupuestos/${budget.id}/convertir-a-factura`) && response.request().method() === 'POST');
  await page.locator('.budget-panel').getByRole('button', { name: 'Facturar', exact: true }).click();
  const invoiceResponse = await createdInvoice;
  expect(invoiceResponse.ok(), await invoiceResponse.text()).toBeTruthy();
  const invoice = await invoiceResponse.json() as { id: string; total: string; lineas: Array<{ historial_id: string }> };
  expect(Number(invoice.total)).toBe(75);
  expect(invoice.lineas.map(item => item.historial_id)).toContain(clinical.id);

  await page.goto('/caja');
  const invoiceRow = page.getByRole('row').filter({ has: page.locator(`a[href="/pacientes?paciente_id=${patient.id}"]`) });
  await invoiceRow.getByRole('button', { name: 'Cobrar', exact: true }).click();
  const paymentDialog = page.getByRole('dialog', { name: 'Registrar cobro', exact: true });
  await expect(paymentDialog.getByLabel('Importe (€)')).toHaveValue('75.00');
  await paymentDialog.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
  await expect(paymentDialog).not.toBeVisible();
  const balance = await api<{ pendiente: string; total_facturado: string; total_cobrado: string }>(request, token, `/pacientes/${patient.id}/saldo`);
  expect(Number(balance.total_facturado)).toBe(75);
  expect(Number(balance.total_cobrado)).toBe(75);
  expect(Number(balance.pendiente)).toBe(0);
  await page.reload();
  await expect(invoiceRow).toHaveCount(0);
  const history = await api<Array<{ id: string; factura_id: string }>>(request, token, `/tratamientos/historial/${patient.id}`);
  expect(history.find(item => item.id === clinical.id)?.factura_id).toBe(invoice.id);
});
