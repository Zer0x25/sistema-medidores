import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Consumos Consolidados y Conciliación de Facturas", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe cargar la vista de reportes, filtrar consumos y visualizar métricas por medidor", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a la pestaña Reportes
    await page.click("#tabReportesBtn");
    await expect(page.locator("#viewReportes")).toBeVisible();
    await expect(page.locator("#headingReportes")).toContainText("Consumos Consolidados");

    // 2. Presionar botón Filtrar para cargar los consumos consolidados
    await page.click("#viewReportes button:has-text('Filtrar')");

    // 3. Verificar que la tabla de consumos renderiza registros
    const tbodyConsumos = page.locator("#tbodyReporteConsumos");
    await expect(tbodyConsumos).toBeVisible();
    await expect(tbodyConsumos.locator("tr")).not.toHaveCount(0);
    // Verificar que al menos un medidor o fila de consumo contiene datos de recursos
    await expect(tbodyConsumos).toContainText("M3");
  });

  test("debe permitir registrar una factura de proveedor y visualizar su estado de conciliación", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabReportesBtn");
    await expect(page.locator("#viewReportes")).toBeVisible();

    // 1. Abrir modal para registrar factura
    await page.click("#viewReportes button:has-text('Registrar Factura')");
    const modal = page.locator("#modalRegistrarFactura");
    await expect(modal).toBeVisible();

    // 2. Completar formulario de factura
    const selectSede = page.locator("#facturaInstalacionId");
    await expect(selectSede.locator("option")).not.toHaveCount(0);
    // Seleccionar la primera instalación disponible
    await selectSede.selectOption({ index: 0 });

    const numeroFactura = `FAC-E2E-${Date.now()}`;
    await page.fill("#facturaNumero", numeroFactura);
    await page.fill("#facturaPeriodoInicio", "2026-01-01");
    await page.fill("#facturaPeriodoFin", "2026-12-31");
    await page.fill("#facturaConsumo", "1500.50");
    await page.fill("#facturaMonto", "250000");

    // 3. Enviar formulario
    await page.click("#formRegistrarFactura button[type='submit']");

    // 4. Validar cierre de modal y notificación de éxito
    await expect(modal).toBeHidden();
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();

    // 5. Verificar que la tabla de facturas cargó el registro con su estado de conciliación
    const tbodyFacturas = page.locator("#tbodyReporteFacturas");
    await expect(tbodyFacturas).toBeVisible();
    const fila = tbodyFacturas.locator("tr", { hasText: numeroFactura });
    await expect(fila).toBeVisible();
    // Este rango anual no tiene lecturas de apertura/cierre: no se puede conciliar con cero ficticio.
    await expect(fila).toContainText("PENDIENTE");
  });

  test("debe permitir exportar el reporte de consumos a archivo CSV", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabReportesBtn");
    await expect(page.locator("#viewReportes")).toBeVisible();

    // Filtrar primero para que existan datos en la tabla
    await page.click("#viewReportes button:has-text('Filtrar')");
    await expect(page.locator("#tbodyReporteConsumos tr")).not.toHaveCount(0);

    // Capturar la descarga del archivo CSV
    const downloadPromise = page.waitForEvent("download");
    await page.click("#viewReportes button:has-text('Exportar CSV')");
    const download = await downloadPromise;

    // Verificar nombre del archivo exportado
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });
});
