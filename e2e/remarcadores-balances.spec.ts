import { expect, test, APIRequestContext } from "@playwright/test";
const inputFecha = (fecha: Date): string => fecha.toISOString().slice(0, -1)
  .replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/:00$/, "");
interface Equipo { id: string; codigo: string; medidorPadreId: string | null }
test.use({ timezoneId: "UTC" });
let headers: { Authorization: string };
let instalacionId: string;
let tipoMedidorId: string;
async function crear(request: APIRequestContext, padre?: string): Promise<Equipo> {
  const r = await request.post("/api/medidores", { headers, data: { instalacionId, tipoMedidorId,
    codigo: `REM-${crypto.randomUUID()}`, ubicacionInterna: "Sector de prueba", medidorPadreId: padre } });
  expect(r.status()).toBe(201); return r.json();
}
test.beforeEach(async ({ request, page }) => {
  expect((await request.post("/api/demo/seed")).ok()).toBeTruthy();
  const login = await request.post("/api/auth/login", { data: { email: "admin@medidores.cl", password: "demo1234" } });
  headers = { Authorization: `Bearer ${(await login.json()).token}` };
  const inst = await request.post("/api/instalaciones", { headers, data: { nombre: `Remarcadores ${crypto.randomUUID()}`, ubicacion: "Norte" } });
  expect(inst.status()).toBe(201); instalacionId = (await inst.json()).id;
  const tipo = await request.post("/api/tipos-medidor", { headers, data: { nombre: `Agua ${crypto.randomUUID()}`, recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO" } });
  expect(tipo.status()).toBe(201); tipoMedidorId = (await tipo.json()).id;
  await page.goto("/#/login");
  await page.waitForFunction(() => document.body.dataset.appReady === "true");
  await page.locator("#loginEmail").fill("admin@medidores.cl");
  await page.locator("#loginPassword").fill("demo1234");
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#viewAdmin")).toBeVisible();
});
test("alta y cambio de padre persisten al recargar y reabrir el formulario", async ({ page, request }) => {
  const padre = await crear(request);
  await page.goto("/#/parque");
  await page.getByTestId("btn-nuevo-medidor").click();
  await page.locator("#selectMedidorInstalacion").selectOption(instalacionId);
  await page.locator("#selectMedidorTipo").selectOption(tipoMedidorId);
  await expect(page.getByTestId("select-medidor-padre").locator(`option[value='${padre.id}']`)).toBeAttached();
  await page.getByTestId("select-medidor-padre").selectOption(padre.id);
  const codigo = `HIJO-${Date.now()}`;
  await page.locator("#inputMedidorCodigo").fill(codigo);
  await page.locator("#inputMedidorUbicacion").fill("Sector cocina");
  await page.getByTestId("btn-submit-medidor").click();
  await expect(page.getByTestId("modal-medidor")).toHaveAttribute("data-state", "closed");
  const lista = await (await request.get(`/api/medidores?instalacionId=${instalacionId}`, { headers })).json() as Equipo[];
  const hijo = lista.find(m => m.codigo === codigo)!;
  expect(hijo.medidorPadreId).toBe(padre.id);
  await crear(request, hijo.id);
  await page.reload(); await page.waitForFunction(() => document.body.dataset.appReady === "true");
  await page.getByTestId("btn-parque-tab-medidores").click();
  const fila = page.locator(`#viewParque tr[data-medidor-id='${hijo.id}']`);
  await expect(fila).toContainText(padre.codigo);
  await fila.getByTestId("btn-cambiar-padre").click();
  await expect(page.getByTestId("modal-cambiar-padre")).toHaveAttribute("data-state", "open");
  await expect(page.locator("#selectCambiarPadre")).toHaveValue(padre.id);
  await expect(page.locator(`#selectCambiarPadre option[value='${hijo.id}']`)).toHaveCount(0);
  await page.locator("#selectCambiarPadre").selectOption("");
  await page.getByTestId("btn-submit-cambiar-padre").click();
  await expect(page.getByTestId("modal-cambiar-padre")).toHaveAttribute("data-state", "closed");
  expect((await (await request.get(`/api/medidores/${hijo.id}`, { headers })).json()).medidorPadreId).toBeNull();
  await fila.getByTestId("btn-cambiar-padre").click();
  await expect(page.locator("#selectCambiarPadre")).toHaveValue("");
});
test("terreno muestra consumo entre lecturas y estado insuficiente", async ({ page, request }) => {
  const medidor = await crear(request);
  await page.goto("/#/operador");
  await page.locator("#selectOperadorInstalacion").selectOption(instalacionId);
  const card = page.locator(`#gridMedidoresOperador [data-medidor-id='${medidor.id}']`);
  await expect(card.getByTestId("consumo-entre-lecturas")).toContainText("Datos insuficientes");
  for (const valor of [1250, 1380]) {
    const r = await request.post("/api/lecturas", { headers, data: { medidorId: medidor.id, valor } }); expect(r.status()).toBe(201);
  }
  await page.reload(); await page.waitForFunction(() => document.body.dataset.appReady === "true");
  await page.locator("#selectOperadorInstalacion").selectOption(instalacionId);
  await expect(card.getByTestId("consumo-entre-lecturas")).toContainText("130");
  await expect(card.getByTestId("consumo-entre-lecturas")).toContainText("M3");
});
test("balance alineado, saldo y móvil sin desbordamiento", async ({ page, request }) => {
  const padre = await crear(request); const hijo = await crear(request, padre.id); const nieto = await crear(request, hijo.id);
  const inicio = new Date();
  for (const m of [padre, hijo, nieto]) expect((await request.post("/api/lecturas", { headers, data: { medidorId: m.id, valor: 1000, fechaLectura: inicio.toISOString() } })).status()).toBe(201);
  const fin = new Date();
  for (const [m, delta] of [[padre, 100], [hijo, 40], [nieto, 10]] as const) expect((await request.post("/api/lecturas", { headers, data: { medidorId: m.id, valor: 1000 + delta, fechaLectura: fin.toISOString() } })).status()).toBe(201);
  await page.goto("/#/reportes");
  await page.locator("#filtroReporteSede").selectOption(instalacionId);
  // El contexto Chromium de esta suite usa UTC para conservar milisegundos exactos del fixture.
  await page.locator("#balanceFechaInicio").fill(inputFecha(inicio));
  await page.locator("#balanceFechaFin").fill(inputFecha(fin));
  await page.getByTestId("btn-calcular-balance").click();
  const p = page.getByTestId(`balance-nodo-${padre.id}`);
  await expect(p).toHaveAttribute("data-estado", "CALCULADO");
  await expect(p.locator('[data-label="Saldo sin distribuir"]')).toHaveText("60 M3");
  await expect(page.getByTestId("balance-totales")).toContainText("100 M3");
  for (const width of [320, 375, 425, 768, 1024]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await expect(p).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 850 });
  await page.getByTestId("balance-sectores").screenshot({ path: "/tmp/remarcadores-balance-mobile.png" });
  const desalineado = new Date();
  expect((await request.post("/api/lecturas", { headers, data: { medidorId: hijo.id, valor: 1050, fechaLectura: desalineado.toISOString() } })).status()).toBe(201);
  await page.locator("#balanceFechaFin").fill(inputFecha(desalineado));
  await page.getByTestId("btn-calcular-balance").click();
  await expect(p).toHaveAttribute("data-estado", "NO_COMPARABLE");
  await expect(p).toContainText("fechas distintas");
});
