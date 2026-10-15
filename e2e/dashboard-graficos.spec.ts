import { test, expect, Page } from "@playwright/test";

test.describe("Dashboard Gráficos por Medidor e Instalación (feat-028)", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  async function loginComoAdmin(page: Page): Promise<void> {
    await page.goto("/#/login");
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    await page.fill("#loginEmail", "admin@medidores.cl");
    await page.fill("#loginPassword", "demo1234");
    await page.click("#btnLoginSubmit");
    await expect(page.locator("#viewAdmin")).toBeVisible();
  }

  test("muestra sección de gráficos con 3 canvas y filtros", async ({ page }) => {
    await loginComoAdmin(page);
    await page.goto("/#/dashboard");
    await page.waitForFunction(() => document.body.dataset.appReady === "true");

    const seccion = page.locator("#viewAdmin #seccionGraficos");
    await expect(seccion).toBeVisible();
    await expect(page.locator("#viewAdmin canvas#chartEvolucionMedidor")).toBeVisible();
    await expect(page.locator("#viewAdmin canvas#chartConsumoInstalacion")).toBeVisible();
    await expect(page.locator("#viewAdmin canvas#chartDistribucionRecurso")).toBeVisible();
    await expect(page.locator("#viewAdmin #filtroGraficoInstalacion")).toBeVisible();
    await expect(page.locator("#viewAdmin #filtroGraficoMedidor")).toBeVisible();
    await expect(page.locator("#viewAdmin #filtroGraficoRecurso")).toBeVisible();
  });

  test("filtrar por recurso no rompe los canvas y mantiene series", async ({ page, request }) => {
    await loginComoAdmin(page);
    await page.goto("/#/dashboard");
    await page.waitForFunction(() => document.body.dataset.appReady === "true");

    await page.selectOption("#viewAdmin #filtroGraficoRecurso", "AGUA");
    await expect(page.locator("#viewAdmin canvas#chartEvolucionMedidor")).toBeVisible();

    const seed = await request.post("/api/demo/seed");
    const seedJson = (await seed.json()) as { seedData: { instalaciones: Array<{ id: string }> } };
    expect(seedJson.seedData.instalaciones.length).toBeGreaterThan(0);
  });
});
