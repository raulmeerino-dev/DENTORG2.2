import { expect, test } from '@playwright/test';

// Read-only UI review against the synthetic patient from seed_ui_density.py.
test.skip(process.env.DENTCORE_UI_E2E !== '1', 'Requires seed_ui_density.py in the isolated test runtime');
const patientId = '387ca69d-ec76-5af6-9c1d-d95f36597e41';
const patientName = 'UIQA María de los Ángeles Fernández de la Torre y Sánchez de la Vega';

for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1366, height: 600 }]) {
  test(`cabecera, áreas y menú de línea a ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    await page.getByLabel('Usuario', { exact: true }).fill('admin');
    await page.getByLabel('Contraseña', { exact: true }).fill('admin1234');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const writes: string[] = [];
    page.on('request', request => {
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) && !request.url().includes('/auth/')) writes.push(request.url());
    });
    await page.goto(`/pacientes?paciente_id=${patientId}`);
    await expect(page.getByRole('heading', { name: patientName, exact: true })).toHaveCount(1);
    const areas = page.getByRole('navigation', { name: 'Áreas del paciente', exact: true });
    for (const area of ['Clínica', 'Presupuestos', 'Historial', 'Ficha']) {
      await areas.getByRole('button', { name: area, exact: true }).click();
      await expect(areas.getByRole('button', { name: area, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: patientName, exact: true })).toHaveCount(1);
    }
    await areas.getByRole('button', { name: 'Presupuestos', exact: true }).click();
    await page.getByRole('button', { name: /#\d+ Borrador Total/ }).first().click();
    const lines = page.getByRole('region', { name: 'Líneas del presupuesto', exact: true });
    const row = lines.getByRole('row').filter({ has: page.getByRole('button', { name: 'Editar línea 2', exact: true }) });
    const trigger = row.getByRole('button', { name: /^Acciones:/ });
    const menuName = await trigger.getAttribute('aria-label');
    await row.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: menuName!, exact: true });
    await expect(menu).toBeVisible();
    const labels = await menu.getByRole('menuitem').allTextContents();
    expect(labels).toContain('Editar línea');
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath('patient-context-menu.png') });
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
    await trigger.click();
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(labels);
    await page.keyboard.press('Escape');
    await row.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Contraer navegación' }).click();
    await expect(page.getByRole('button', { name: 'Expandir navegación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: patientName, exact: true })).toHaveCount(1);
    expect(writes).toEqual([]);
  });
}
