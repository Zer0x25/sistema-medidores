import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { config } from "../src/core/config.js";
import { signJwt } from "../src/modules/usuarios/auth.utils.js";
import { PrismaMedidoresRepository } from "../src/modules/medidores/medidores.repository.js";
import { MedidoresService } from "../src/modules/medidores/medidores.service.js";

describe("Remarcadores: persistencia, API y aislamiento", () => {
  const dir = mkdtempSync(join(tmpdir(), "remarcadores-test-"));
  const prisma: PrismaClient = new PrismaClient({ datasources: { db: { url: `file:${dir}/test.db` } } });
  let app: FastifyInstance;
  let headers: { authorization: string };
  let instalacionId: string;
  let tipoMedidorId: string;
  let usuarioId: string;
  beforeAll(async () => {
    writeFileSync(join(dir, "test.db"), "");
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], {
      env: { ...process.env, DATABASE_URL: `file:${dir}/test.db` }, stdio: "pipe",
    });
    app = await buildServer({ prisma, serveStatic: false }); await app.ready();
  }, 30000);
  afterAll(async () => { if (app) await app.close(); await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
  beforeEach(async () => {
    const id = crypto.randomUUID();
    const u = await prisma.usuario.create({ data: { email: `${id}@test.cl`, nombre: "Admin", rol: "ADMIN", passwordHash: "test" } });
    usuarioId = u.id;
    headers = { authorization: `Bearer ${signJwt({ userId: u.id, rol: "ADMIN", email: u.email, nombre: u.nombre }, config.JWT_SECRET)}` };
    instalacionId = (await prisma.instalacion.create({ data: { nombre: id, ubicacion: "Norte" } })).id;
    tipoMedidorId = (await prisma.tipoMedidor.create({ data: { nombre: id, recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO" } })).id;
  });
  async function crear(padre?: string) {
    const r = await app.inject({ method: "POST", url: "/api/medidores", headers,
      payload: { instalacionId, tipoMedidorId, codigo: `MED-${crypto.randomUUID()}`, ubicacionInterna: "Sala técnica", medidorPadreId: padre } });
    expect(r.statusCode).toBe(201); return r.json<{ id: string; medidorPadreId: string | null }>();
  }
  it("alta padre-hijo-nieto y GET independiente preservan el vínculo y su auditoría", async () => {
    const p = await crear(); const h = await crear(p.id); const n = await crear(h.id);
    const r = await app.inject({ url: `/api/medidores/${n.id}`, headers });
    expect(r.json().medidorPadreId).toBe(h.id); expect(r.json().medidorPadre.codigo).toContain("MED-");
    const a = await prisma.auditoriaEvento.findFirst({ where: { entidadId: n.id, accion: "MEDIDOR_PADRE_ASIGNADO" } });
    expect(a?.usuarioId).toBe(usuarioId);
  });
  it("ciclo indirecto, autorreferencia y padre inexistente rechazan sin mutar", async () => {
    const p = await crear(); const h = await crear(p.id);
    for (const padre of [p.id, h.id]) {
      const r = await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}/padre`, headers, payload: { medidorPadreId: padre } });
      expect(r.statusCode).toBe(422); expect(r.json().error).toBe("MEDIDOR_JERARQUIA_CICLICA");
    }
    const r = await app.inject({ method: "PATCH", url: `/api/medidores/${h.id}/padre`, headers, payload: { medidorPadreId: crypto.randomUUID() } });
    expect(r.statusCode).toBe(404);
    expect((await app.inject({ url: `/api/medidores/${p.id}`, headers })).json().medidorPadreId).toBeNull();
  });
  it("desvincular y repetir no duplica eventos; no borra historial", async () => {
    const p = await crear(); const h = await crear(p.id);
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: "PATCH", url: `/api/medidores/${h.id}/padre`, headers, payload: { medidorPadreId: null } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/medidores/${h.id}`, headers })).json().medidorPadreId).toBeNull();
    expect(await prisma.medidorVinculo.count({ where: { medidorId: h.id } })).toBe(2);
    const r = await app.inject({ method: "DELETE", url: `/api/medidores/${h.id}`, headers });
    expect(r.statusCode).toBe(422); expect(r.json().error).toBe("MEDIDOR_CON_VINCULOS_NO_ELIMINABLE");
  });
  it("archivar padre con hijos activos y asignar padre de otra sede se rechazan", async () => {
    const p = await crear(); const h = await crear(p.id);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}/archivar`, headers })).statusCode).toBe(422);
    const ajena = await prisma.instalacion.create({ data: { nombre: "Otra", ubicacion: "Sur" } });
    const r = await app.inject({ method: "POST", url: "/api/medidores", headers, payload: { instalacionId: ajena.id, tipoMedidorId, codigo: crypto.randomUUID(), ubicacionInterna: "Sur", medidorPadreId: h.id } });
    expect(r.statusCode).toBe(422);
  });
  it("datos insuficientes y delta se consultan sin duplicar el factor", async () => {
    const m = await crear();
    const url = `/api/medidores/${m.id}/consumo-actual`;
    expect((await app.inject({ url, headers })).json().consumo).toBeNull();
    for (const [i, valor] of [1250, 1380].entries()) await prisma.lectura.create({ data: { medidorId: m.id, operadorId: usuarioId, valor, multiplicadorAplicado: 20, fechaLectura: new Date(Date.now() - (2 - i) * 1000) } });
    const r = await app.inject({ url, headers }); expect(r.statusCode).toBe(200); expect(r.json().consumo).toBe(130);
  });
  it("balance real usa la apertura anterior al rango, suma raíces y preserva saldo negativo", async () => {
    const p = await crear(); const h = await crear(p.id);
    const inicio = new Date(Date.now() - 20000); const fin = new Date(Date.now() - 1000);
    await prisma.medidor.updateMany({ where: { instalacionId }, data: { createdAt: new Date(inicio.getTime() - 2000) } });
    // La vinculación precede a la apertura en este fixture histórico controlado.
    await prisma.$executeRaw`UPDATE medidor_vinculos SET vigenteDesde = ${new Date(inicio.getTime() - 1000)} WHERE medidorId = ${h.id}`;
    for (const [medidorId, delta] of [[p.id, 100], [h.id, 110]] as const) {
      await prisma.lectura.createMany({ data: [
        { medidorId, operadorId: usuarioId, valor: 1000, multiplicadorAplicado: 1, fechaLectura: inicio },
        { medidorId, operadorId: usuarioId, valor: 1000 + delta, multiplicadorAplicado: 1, fechaLectura: fin },
      ] });
    }
    const q = new URLSearchParams({ instalacionId, fechaInicio: inicio.toISOString(), fechaFin: fin.toISOString() });
    const r = await app.inject({ url: `/api/reportes/balances?${q}`, headers });
    expect(r.statusCode).toBe(200); const b = r.json();
    expect(b.nodos[0].saldoSinDistribuir).toBe(-10); expect(b.totales[0].consumo).toBe(100);
    const obs = await app.inject({ url: `/api/reportes/consumos?${new URLSearchParams({ instalacionId, fechaInicio: new Date(inicio.getTime() + 1).toISOString(), fechaFin: fin.toISOString() })}`, headers });
    expect(obs.json().find((m: { medidorId: string }) => m.medidorId === p.id).consumoNeto).toBe(100);
  });
  it("API nueva exige autenticación, rol y asignación territorial", async () => {
    const m = await crear(); const url = `/api/medidores/${m.id}/consumo-actual`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    const u = await prisma.usuario.create({ data: { email: `${crypto.randomUUID()}@test.cl`, nombre: "Operador", rol: "OPERADOR", passwordHash: "test" } });
    const op = { authorization: `Bearer ${signJwt({ userId: u.id, rol: "OPERADOR", email: u.email, nombre: u.nombre }, config.JWT_SECRET)}` };
    expect((await app.inject({ url, headers: op })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/reportes/balances?instalacionId=${instalacionId}`, headers: op })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${m.id}/padre`, headers: op, payload: { medidorPadreId: null } })).statusCode).toBe(403);
    await prisma.asignacionOperador.create({ data: { usuarioId: u.id, instalacionId } });
    expect((await app.inject({ url, headers: op })).statusCode).toBe(200);
  });
  it("rollback de auditoría revierte el vínculo completo", async () => {
    const p = await crear(); const h = await crear();
    await prisma.$executeRawUnsafe("CREATE TRIGGER fallar_auditoria BEFORE INSERT ON auditoria_eventos BEGIN SELECT RAISE(ABORT, 'AUDIT_TEST'); END");
    try {
      const svc = new MedidoresService(new PrismaMedidoresRepository(prisma), { verifyInstalacionActiva: async () => {} });
      await expect(svc.cambiarPadre(h.id, { medidorPadreId: p.id }, { usuarioId })).rejects.toBeDefined();
      expect((await prisma.medidor.findUniqueOrThrow({ where: { id: h.id } })).medidorPadreId).toBeNull();
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER fallar_auditoria"); }
  });
  it("concurrencia A→B/B→A nunca deja un ciclo", async () => {
    const a = await crear(); const b = await crear();
    const resultados = await Promise.all([app.inject({ method: "PATCH", url: `/api/medidores/${a.id}/padre`, headers, payload: { medidorPadreId: b.id } }),
      app.inject({ method: "PATCH", url: `/api/medidores/${b.id}/padre`, headers, payload: { medidorPadreId: a.id } })]);
    expect(resultados.some(r => r.statusCode === 200)).toBe(true);
    expect(resultados.some(r => [409, 422].includes(r.statusCode))).toBe(true);
    const actualA = (await app.inject({ url: `/api/medidores/${a.id}`, headers })).json();
    const actualB = (await app.inject({ url: `/api/medidores/${b.id}`, headers })).json();
    expect(actualA.medidorPadreId === b.id && actualB.medidorPadreId === a.id).toBe(false);
  });
  it("una raíz sin lecturas impide una conciliación aparentemente completa", async () => {
    const p = await crear(); await crear();
    const inicio = new Date(Date.now() - 10000); const fin = new Date(Date.now() - 1000);
    await prisma.medidor.updateMany({ where: { instalacionId }, data: { createdAt: new Date(inicio.getTime() - 1000) } });
    await prisma.lectura.createMany({ data: [
      { medidorId: p.id, operadorId: usuarioId, valor: 1000, multiplicadorAplicado: 1, fechaLectura: inicio },
      { medidorId: p.id, operadorId: usuarioId, valor: 1100, multiplicadorAplicado: 1, fechaLectura: fin },
    ] });
    const r = await app.inject({ method: "POST", url: "/api/reportes/facturas", headers, payload: {
      instalacionId, recurso: "AGUA", unidad: "M3", periodoInicio: inicio, periodoFin: fin, consumoFacturado: 100,
    } });
    expect(r.statusCode).toBe(201); expect(r.json().estadoConciliacion).toBe("PENDIENTE");
    const lectura = await app.inject({ url: `/api/reportes/facturas?instalacionId=${instalacionId}`, headers });
    expect(lectura.json()[0].consumoMedido).toBeNull();
  });
  it("unidades o modo incompatibles no se vinculan y el PATCH genérico no evita el control de archivado", async () => {
    const p = await crear(); await crear(p.id);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}`, headers, payload: { activo: false } })).statusCode).toBe(422);
    const otro = await prisma.tipoMedidor.create({ data: { nombre: crypto.randomUUID(), recurso: "AGUA", unidad: "LITROS", tipoMedicion: "ACUMULATIVO" } });
    const anterior = tipoMedidorId; tipoMedidorId = otro.id;
    const r = await app.inject({ method: "POST", url: "/api/medidores", headers, payload: {
      instalacionId, tipoMedidorId, codigo: crypto.randomUUID(), ubicacionInterna: "Incompatible", medidorPadreId: p.id,
    } });
    expect(r.statusCode).toBe(422); tipoMedidorId = anterior;
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}`, headers, payload: { tipoMedidorId: otro.id } })).statusCode).toBe(422);
    expect((await app.inject({ url: `/api/medidores/${p.id}`, headers })).json().tipoMedidorId).toBe(anterior);
  });

  it("un supervisor no puede vincular un padre de una sede ajena", async () => {
    const ajena = await prisma.instalacion.create({ data: { nombre: crypto.randomUUID(), ubicacion: "Sur" } });
    const padre = await prisma.medidor.create({ data: { instalacionId: ajena.id, tipoMedidorId, codigo: crypto.randomUUID(), ubicacionInterna: "Sur" } });
    const u = await prisma.usuario.create({ data: { email: `${crypto.randomUUID()}@test.cl`, nombre: "Supervisor", rol: "SUPERVISOR", passwordHash: "test" } });
    await prisma.asignacionOperador.create({ data: { usuarioId: u.id, instalacionId } });
    const scopeHeaders = { authorization: `Bearer ${signJwt({ userId: u.id, rol: "SUPERVISOR", email: u.email, nombre: u.nombre }, config.JWT_SECRET)}` };
    const codigo = crypto.randomUUID();
    const r = await app.inject({ method: "POST", url: "/api/medidores", headers: scopeHeaders, payload: { instalacionId, tipoMedidorId, codigo, ubicacionInterna: "Norte", medidorPadreId: padre.id } });
    expect(r.statusCode).toBe(403); expect(r.json().error).toBe("INSTALACION_NO_ASIGNADA");
    expect((await app.inject({ url: `/api/medidores?instalacionId=${instalacionId}`, headers })).json().some((m: { codigo: string }) => m.codigo === codigo)).toBe(false);
  });

  it("valida contratos, UUIDs, rangos y fechas futuras en la API", async () => {
    const m = await crear();
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${m.id}/padre`, headers, payload: { medidorPadreId: null, usuarioId: "falso" } })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/medidores/incorrecto/consumo-actual", headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/medidores/${crypto.randomUUID()}/consumo-actual`, headers })).statusCode).toBe(404);
    for (const [desde, hasta] of [["malformada", "2026-01-01"], ["2026-02-01", "2026-01-01"], ["2099-01-01", "2099-02-01"]]) {
      const q = new URLSearchParams({ instalacionId, fechaInicio: desde, fechaFin: hasta });
      expect((await app.inject({ url: `/api/reportes/balances?${q}`, headers })).statusCode).toBe(400);
    }
  });
  it("restaurar un hijo exige padre activo y conserva ambos vínculos", async () => {
    const p = await crear(); const h = await crear(p.id);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${h.id}/archivar`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}/archivar`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${h.id}/restaurar`, headers })).statusCode).toBe(422);
    expect((await app.inject({ url: `/api/medidores/${h.id}`, headers })).json().activo).toBe(false);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${p.id}/restaurar`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: `/api/medidores/${h.id}/restaurar`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/medidores/${h.id}`, headers })).json().medidorPadreId).toBe(p.id);
  });
  it.each([{ recurso: "LUZ", modo: "ACUMULATIVO" }, { recurso: "AGUA", modo: "NIVEL" }])("rechaza incompatibilidad de recurso/modo: $recurso $modo", async ({ recurso, modo }) => {
    const p = await crear();
    const tipo = await prisma.tipoMedidor.create({ data: { nombre: crypto.randomUUID(), recurso, unidad: "M3", tipoMedicion: modo } });
    const codigo = crypto.randomUUID();
    const r = await app.inject({ method: "POST", url: "/api/medidores", headers, payload: { instalacionId, tipoMedidorId: tipo.id, codigo, ubicacionInterna: "Sector", medidorPadreId: p.id } });
    expect(r.statusCode).toBe(422); expect(r.json().error).toBe("MEDIDOR_PADRE_INCOMPATIBLE");
    expect((await app.inject({ url: `/api/medidores?instalacionId=${instalacionId}`, headers })).json().some((m: { codigo: string }) => m.codigo === codigo)).toBe(false);
  });

});
