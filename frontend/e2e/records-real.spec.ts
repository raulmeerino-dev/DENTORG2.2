import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// The volume fixture is explicit and refuses nonlocal / non-test databases.
// No route interception: listings, downloads, authentication and detail are real.
test.skip(process.env.DENTCORE_RECORDS_E2E !== '1', 'Requires seed_records.py in an isolated real backend');
test.setTimeout(120_000);
test.use({ actionTimeout: 15_000, viewport: { width: 1280, height: 720 } });
const apiBase = process.env.DENTCORE_E2E_API_URL ?? 'http://127.0.0.1:8011/api';
const fixture = {
  clinicA: 'd9e34c07-2dc7-5238-9330-7e8a09e99a0e', clinicB: 'f65095dc-3324-5f0a-bf7b-2381073036b7',
  doctorA: 'a31128c3-9dfc-5428-99d8-595e6aad543b', patientA: '64af3dc7-57e7-5871-b5c5-761fdac29e36',
  patientB: 'c09375ea-14db-5bda-8d55-79a66e5f1ca3', clinicalDocument: 'e320300b-3351-5581-a00a-f0b70955dfa1',
  adminDocument: 'f65a3ca3-2667-5306-9e12-74fb664852a7',
  planA: 'ebd7f2c0-6046-5f82-bc20-5f250ea2f8d3',
};
interface Column { key: string; label: string; type: string }
interface Row { id: string; cells: Record<string, string | number | boolean | null>; target: { id: string; patient_id?: string } }
interface Records { columns: Column[]; rows: Row[]; total: number; limit: number; offset: number }
interface Catalog { views: Array<{ id: string; columns: Column[]; types: Array<{ value: string }> }> }

async function login(request: APIRequestContext, role = 'admin') {
  expect(['localhost', '127.0.0.1']).toContain(new URL(apiBase).hostname);
  const response = await request.post(`${apiBase}/auth/login`, { data: { username: `records_${role}`, password: 'records1234' } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function browserLogin(page: Page, role = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(`records_${role}`);
  await page.locator('input[type="password"]').fill('records1234');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function get<T>(request: APIRequestContext, token: string, route: string): Promise<T> {
  const response = await request.get(`${apiBase}${route}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok(), `${route}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

function listingUrl(page: Page) {
  const params = new URL(page.url()).searchParams;
  const view = params.get('vista') || 'actividad';
  params.delete('vista');
  return `/registros/${view}?${params}`;
}

async function settledRows(page: Page) {
  await expect(page.getByRole('region', { name: 'Resultados de consulta' })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('link', { name: 'Abrir detalle', exact: true }).first()).toBeVisible();
}

function readExport(filename: string): string[][] {
  const localPython = path.resolve('..', 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.DENTCORE_E2E_PYTHON ?? (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
  return JSON.parse(execFileSync(python, [path.resolve('e2e/fixtures/read_records_export.py'), filename], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as string[][];
}

function comparable(value: unknown, column: Column) {
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'number' || column.type === 'money') return String(Number(value));
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

test('Registros: filtros combinados, orden, paginación, detalle, regreso y exportaciones exactas', async ({ page, request }, testInfo) => {
  const token = await login(request);
  await browserLogin(page);
  await page.goto('/registros?vista=citas');
  await page.getByLabel('Buscar registros', { exact: true }).fill('REGQA');
  await expect(page).toHaveURL(/q=REGQA/);
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByLabel('Desde', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-06-30');
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('confirmada');
  await page.getByRole('button', { name: /^Profesional / }).click();
  await page.getByLabel('Buscar profesional', { exact: true }).fill('REGQA Profesional Norte');
  await page.getByRole('option', { name: 'REGQA Profesional Norte', exact: true }).click();
  await page.getByRole('button', { name: /Más filtros/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Más filtros', exact: true });
  await dialog.getByRole('button', { name: /^Clínica / }).click();
  await dialog.getByLabel('Buscar clínica', { exact: true }).fill('REGQA Clinica Norte');
  await dialog.getByRole('option', { name: 'REGQA Clinica Norte', exact: true }).click();
  await dialog.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filas por página', exact: true }).selectOption('25');
  await page.getByRole('button', { name: 'Ordenar por Paciente', exact: true }).click();
  await settledRows(page);
  const first = await get<Records>(request, token, listingUrl(page));
  expect(first.total).toBeGreaterThan(500);
  expect(first.rows).toHaveLength(25);
  expect(first.rows.every(row => row.cells.estado === 'confirmada' && row.cells.clinica === 'REGQA Clinica Norte')).toBe(true);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page).toHaveURL(/offset=25/);
  await settledRows(page);
  const second = await get<Records>(request, token, listingUrl(page));
  expect(second.rows.some(row => first.rows.some(previous => previous.id === row.id))).toBe(false);
  const returnUrl = page.url();
  await page.getByRole('link', { name: 'Abrir detalle', exact: true }).first().click();
  await expect(page).toHaveURL(/\/jornada\?/);
  await expect(page).toHaveURL(new RegExp(`cita_id=${second.rows[0].target.id}`));
  const appointment = page.getByRole('dialog', { name: 'Editar cita', exact: true });
  await expect(appointment).toBeVisible();
  await appointment.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('link', { name: /Volver a (Registros|registros)/ }).click();
  await expect(page).toHaveURL(returnUrl);
  await settledRows(page);
  await page.reload();
  await expect(page).toHaveURL(returnUrl);
  await settledRows(page);
  const params = new URL(page.url()).searchParams;
  params.delete('vista'); params.set('offset', '0'); params.set('limit', '200');
  const expected: Row[] = [];
  while (true) {
    const batch = await get<Records>(request, token, `/registros/citas?${params}`);
    expected.push(...batch.rows);
    if (expected.length >= batch.total) break;
    params.set('offset', String(expected.length));
  }
  for (const [label, extension] of [['CSV', 'csv'], ['Excel', 'xlsx']]) {
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar resultados', exact: true }).click();
    await page.getByRole('menuitem', { name: `Exportar ${label}`, exact: true }).click();
    await page.keyboard.press('Escape');
    const download = await downloadEvent;
    const filename = testInfo.outputPath(`registros.${extension}`);
    await download.saveAs(filename);
    const rows = readExport(filename);
    expect(rows[0]).toEqual(first.columns.map(column => column.label));
    expect(rows.slice(1).map(row => first.columns.map((column, index) => comparable(row[index], column))))
      .toEqual(expected.map(row => first.columns.map(column => comparable(row.cells[column.key], column))));
  }
  await page.screenshot({ path: testInfo.outputPath('records-dense-1280.png') });
});

test('Archivos: búsqueda remota de paciente, categoría, documento dedicado y regreso', async ({ page }, testInfo) => {
  await browserLogin(page);
  await page.goto('/archivos');
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByRole('button', { name: /^Paciente / }).click();
  await page.getByLabel('Buscar paciente', { exact: true }).fill('REGQA0980');
  await page.getByRole('option').filter({ hasText: 'REGQA0980' }).click();
  await page.getByRole('combobox', { name: /Tipo/ }).selectOption('radiografia');
  await page.keyboard.press('Escape');
  await settledRows(page);
  await expect(page.getByRole('link', { name: 'Abrir detalle', exact: true })).toHaveCount(1);
  const returnUrl = page.url();
  await page.getByRole('link', { name: 'Abrir detalle', exact: true }).click();
  await expect(page).toHaveURL(/\/archivo\/documento\//);
  await expect(page.getByTitle('Vista de REGQA-0980-radiografia.pdf', { exact: true })).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('link', { name: 'Descargar original', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('patient-file-dedicated-1280.png') });
  await page.getByRole('link', { name: /Volver a (Archivos|archivos)/ }).click();
  await expect(page).toHaveURL(returnUrl);
  await settledRows(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole('link', { name: 'Abrir detalle', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('archives-mobile.png') });
});

test('Registros: factura seleccionada en historial y presupuesto original dentro del paciente', async ({ page, request }) => {
  const token = await login(request);
  await browserLogin(page);
  await page.goto(`/registros?vista=facturas&paciente_id=${fixture.patientA}`);
  await settledRows(page);
  const invoices = await get<Records>(request, token, listingUrl(page));
  expect(invoices.rows).toHaveLength(1);
  const invoice = invoices.rows[0];
  const invoiceReturn = page.url();
  await page.getByRole('link', { name: 'Abrir detalle', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`factura_id=${invoice.target.id}`));
  await expect(page.locator('.history-record-focus')).toContainText(String(invoice.cells.numero).replace('-', '/'));
  await expect(page.getByRole('button', { name: 'Ver historial completo', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Registros', exact: true }).click();
  await expect(page).toHaveURL(invoiceReturn);
  await page.getByRole('combobox', { name: 'Vista', exact: true }).selectOption('planes');
  await settledRows(page);
  const plans = await get<Records>(request, token, listingUrl(page));
  // Visual QA may create other drafts; follow the deterministic seeded plan.
  const plan = plans.rows.find(row => row.target.id === fixture.planA);
  expect(plan, 'The original seeded budget must be listed').toBeDefined();
  if (!plan) throw new Error('Seeded budget missing');
  const original = await get<{ numero: number }>(request, token, `/presupuestos/${plan.target.id}`);
  const planReturn = page.url();
  await page.getByRole('link', { name: 'Abrir detalle', exact: true }).nth(plans.rows.indexOf(plan)).click();
  await expect(page).toHaveURL(new RegExp(`presupuesto_id=${plan.target.id}`));
  await expect(page.locator('.budget-num')).toHaveText(`Presupuesto #${original.numero}`);
  await page.getByRole('link', { name: 'Volver a Registros', exact: true }).click();
  await expect(page).toHaveURL(planReturn);
});

test('Registros: permisos reales, ausencia de datos clínicos/económicos y aislamiento por clínica', async ({ page, request }) => {
  const reception = await login(request, 'recepcion');
  const doctor = await login(request, 'doctor');
  const catalogReception = await get<Catalog>(request, reception, '/registros/catalogo');
  const catalogDoctor = await get<Catalog>(request, doctor, '/registros/catalogo');
  for (const forbidden of ['realizados', 'tratamientos', 'laboratorio', 'auditoria']) {
    expect(catalogReception.views.some(view => view.id === forbidden)).toBe(false);
  }
  for (const forbidden of ['facturas', 'cobros', 'saldos', 'auditoria', 'inventario']) {
    expect(catalogDoctor.views.some(view => view.id === forbidden)).toBe(false);
    const denied = await request.get(`${apiBase}/registros/${forbidden}`, { headers: { Authorization: `Bearer ${doctor}` } });
    expect(denied.status()).toBe(403);
  }
  expect(catalogDoctor.views.flatMap(view => view.columns).some(column => ['importe', 'saldo', 'facturado', 'cobrado'].includes(column.key))).toBe(false);
  const receptionDocs = await get<Records>(request, reception, '/registros/documentos?q=REGQA&limit=200');
  expect(receptionDocs.total).toBe(100);
  expect(receptionDocs.rows.every(row => row.cells.tipo === 'circular' && row.cells.clinica === 'REGQA Clinica Norte')).toBe(true);
  expect(JSON.stringify(receptionDocs)).not.toContain('SECRETO_CLINICO_QA_REGISTROS');
  const activity = await get<Records>(request, reception, '/registros/actividad?q=SECRETO_CLINICO_QA_REGISTROS');
  expect(activity.total).toBe(0);
  for (const token of [reception, doctor]) {
    const denied = await request.get(`${apiBase}/registros/pacientes?clinica_id=${fixture.clinicB}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
    const foreignPatient = await get<Records>(request, token, `/registros/pacientes?paciente_id=${fixture.patientB}`);
    expect(foreignPatient.total).toBe(0);
    expect(foreignPatient.rows).toHaveLength(0);
    const options = await get<Array<{ id: string }>>(request, token, '/registros/opciones/pacientes?q=REGQA10&limit=30');
    expect(options).toHaveLength(0);
  }
  const clinical = await request.get(`${apiBase}/pacientes/${fixture.patientA}/documentos/${fixture.clinicalDocument}/descargar`, { headers: { Authorization: `Bearer ${reception}` } });
  expect(clinical.status()).toBe(403);
  const administrative = await request.get(`${apiBase}/pacientes/${fixture.patientA}/documentos/${fixture.adminDocument}/descargar`, { headers: { Authorization: `Bearer ${reception}` } });
  expect(administrative.status()).toBe(200);
  await browserLogin(page, 'doctor');
  await page.goto('/registros');
  await expect(page.getByRole('combobox', { name: 'Vista', exact: true })).toBeVisible();
  expect(await page.getByRole('combobox', { name: 'Vista', exact: true }).locator('option').allTextContents()).not.toContain('Facturación');
});

test('Registros: miles de filas paginadas, consulta acotada y estado vacío', async ({ page, request }, testInfo) => {
  const token = await login(request);
  const started = Date.now();
  const dense = await get<Records>(request, token, '/registros/citas?q=REGQA&limit=100&sort_by=fecha&sort_dir=asc');
  const elapsed = Date.now() - started;
  expect(dense.total).toBe(3120);
  expect(dense.rows).toHaveLength(100);
  expect(elapsed, 'Bounded SQL query should finish within 5 seconds on the local QA runtime').toBeLessThan(5000);
  await testInfo.attach('query-timing', { body: JSON.stringify({ rows: dense.total, returned: dense.rows.length, elapsedMs: elapsed }), contentType: 'application/json' });
  await browserLogin(page);
  await page.goto('/registros?vista=citas&q=REGQA&limit=100');
  await settledRows(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('records-dense-1920.png') });
  await page.getByLabel('Buscar registros', { exact: true }).fill('REGQA SIN COINCIDENCIA 999999');
  await expect(page.getByText('No hay resultados con estos filtros.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir detalle', exact: true })).toHaveCount(0);
});
