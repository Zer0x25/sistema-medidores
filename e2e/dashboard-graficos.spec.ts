import { test, expect, Page } from "@playwright/test";

interface ChartWindow extends Window {
  cargarGraficosDashboard(): Promise<void>;
  cargarIntervalosGrafico(forzar?: boolean): Promise<void>;
  renderizarGraficosDashboard(): void;
  Charts: { dibujarIntervalos: (canvas: HTMLCanvasElement, datos: Array<{ estado: string; consumo: number | null }>) => void };
  valoresBarras: Array<number | null>;
}
test.use({ timezoneId: "UTC" });

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

  async function fixture(request: import("@playwright/test").APIRequestContext) {
    const login = await request.post("/api/auth/login", { data: { email: "admin@medidores.cl", password: "demo1234" } });
    const headers = { Authorization: `Bearer ${(await login.json()).token}` };
    const inst = await request.post("/api/instalaciones", { headers, data: { nombre: `Gráficos ${crypto.randomUUID()}`, ubicacion: "Prueba" } });
    expect(inst.status()).toBe(201);
    const instalacionId = (await inst.json()).id as string;
    const tipo = await request.post("/api/tipos-medidor", { headers, data: { nombre: `Agua ${crypto.randomUUID()}`, recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO" } });
    expect(tipo.status()).toBe(201);
    const codigo = `GRAF-${crypto.randomUUID()}`;
    const med = await request.post("/api/medidores", { headers, data: { codigo, instalacionId, tipoMedidorId: (await tipo.json()).id, ubicacionInterna: "Prueba" } });
    expect(med.status()).toBe(201);
    const medidorId = (await med.json()).id as string, fin = Date.now();
    let valor = 1000;
    for (let i = 0; i <= 60; i++) {
      if (i) valor += 3 + i % 5;
      const r = await request.post("/api/lecturas", { headers, data: { medidorId, valor, fechaLectura: new Date(fin - (60 - i) * 3600000).toISOString() } });
      expect(r.status()).toBe(201);
    }
    return { medidorId, instalacionId, codigo };
  }

  test("barras con carga visible, páginas SQL y detalle acotado sin acumulación", async ({ page, request }) => {
    const f = await fixture(request);
    await page.setViewportSize({ width: 1440, height: 360 });
    const historial: string[] = [];
    page.on("request", r => { if (r.url().includes("/api/dashboard/intervalos?")) historial.push(r.url()); });
    const resumen = page.waitForResponse(r => r.url().includes("/api/dashboard/graficos?") && r.url().includes("vista=resumen"));
    await loginComoAdmin(page);
    const datos = (await (await resumen).json()) as { grupos: Array<{ series: unknown[] }> };
    expect(datos.grupos.every(g => g.series.length === 0)).toBe(true);
    await expect(page.locator(`#filtroGraficoInstalacion option[value='${f.instalacionId}']`)).toBeAttached();
    // Selección sin scroll: el panel aún queda debajo del viewport.
    await page.evaluate(id => { const s = document.getElementById("filtroGraficoInstalacion") as HTMLSelectElement; s.value = id; return (window as unknown as ChartWindow).cargarGraficosDashboard(); }, f.instalacionId);
    expect(historial).toHaveLength(0);
    const primera = page.waitForResponse(r => r.url().includes("/api/dashboard/intervalos?") && new URL(r.url()).searchParams.get("medidorId") === f.medidorId);
    await page.getByTestId("panel-evolucion").scrollIntoViewIfNeeded();
    expect((await (await primera).json()).items).toHaveLength(30);
    await expect(page.getByTestId("estado-evolucion")).toContainText(f.codigo);
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(0);
    await page.evaluate(() => {
      const app = window as unknown as ChartWindow, render = app.Charts.dibujarIntervalos;
      app.Charts.dibujarIntervalos = (canvas, datos) => { app.valoresBarras = datos.map(c => c.consumo); render(canvas, datos); };
      app.renderizarGraficosDashboard();
    });
    expect((await page.evaluate(() => (window as unknown as ChartWindow).valoresBarras))[0]).toBe(3);
    await page.locator("#detalleIntervalos summary").click();
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(30);
    const primeraFila = await page.locator("#tablaIntervalos tbody tr").first().textContent();
    await page.getByTestId("btn-intervalos-antiguos").click();
    await expect(page.locator("#paginaIntervalosInfo")).toContainText("Página 2 de 3");
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(30);
    expect(await page.locator("#tablaIntervalos tbody tr").first().textContent()).not.toBe(primeraFila);
    await page.getByTestId("btn-intervalos-antiguos").click();
    await expect(page.locator("#paginaIntervalosInfo")).toContainText("Página 3 de 3");
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(1);
    await expect(page.getByTestId("btn-intervalos-antiguos")).toBeDisabled();
    await page.getByTestId("btn-intervalos-recientes").click();
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(30);
    const cuenta = historial.length;
    for (const width of [320, 375, 425, 768, 1024]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(() => (window as unknown as ChartWindow).renderizarGraficosDashboard());
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await page.locator("#tablaIntervalos").evaluate(e => e.clientHeight <= 430 && e.scrollHeight > e.clientHeight)).toBe(true);
    }
    expect(historial).toHaveLength(cuenta);
    await page.locator("#detalleIntervalos summary").click();
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 850 });
    await page.getByTestId("panel-evolucion").screenshot({ path: "/tmp/dashboard-demanda-mobile.png" });
  });

  test("comparte solicitudes, descarta respuestas obsoletas y permite reintentar una página", async ({ page, request }) => {
    const f = await fixture(request);
    await loginComoAdmin(page);
    await expect(page.locator(`#filtroGraficoInstalacion option[value='${f.instalacionId}']`)).toBeAttached();
    await page.locator("#filtroGraficoInstalacion").selectOption(f.instalacionId);
    await page.getByTestId("panel-evolucion").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("estado-evolucion")).toContainText(f.codigo);
    let llamadas = 0;
    await page.route("**/api/dashboard/intervalos?**", async route => {
      llamadas++;
      if (llamadas === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "TEMPORAL", message: "Prueba de reintento" }) });
      else await route.continue();
    });
    await page.evaluate(() => (window as unknown as ChartWindow).cargarIntervalosGrafico(true));
    await expect(page.getByTestId("btn-reintentar-evolucion")).toBeVisible();
    await page.getByTestId("btn-reintentar-evolucion").click();
    await expect(page.getByTestId("estado-evolucion")).toContainText(f.codigo);
    await expect(page.getByTestId("btn-reintentar-evolucion")).toBeHidden();
    await page.unroute("**/api/dashboard/intervalos?**");
    let resolver: (() => void) | undefined;
    const bloquear = new Promise<void>(resolve => { resolver = resolve; });
    let iniciada: (() => void) | undefined;
    const recibida = new Promise<void>(resolve => { iniciada = resolve; });
    llamadas = 0;
    await page.route("**/api/dashboard/intervalos?**", async route => { llamadas++; iniciada!(); await bloquear; await route.continue().catch(() => {}); });
    const peticiones = page.evaluate(() => Promise.all([(window as unknown as ChartWindow).cargarIntervalosGrafico(true), (window as unknown as ChartWindow).cargarIntervalosGrafico(true)]));
    await recibida;
    expect(llamadas).toBe(1);
    await page.locator("#filtroGraficoRecurso").selectOption("GAS");
    resolver!(); await peticiones;
    await expect(page.locator("#estadoGraficos")).toContainText("Sin datos acumulativos");
    await expect(page.locator("#tablaIntervalos tbody tr")).toHaveCount(0);
    await expect(page.getByTestId("estado-evolucion")).not.toContainText(f.codigo);
  });
});
