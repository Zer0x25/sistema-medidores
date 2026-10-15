import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { sembrarHistorico } from "../../../scripts/seed-historico.js";
import { DashboardService } from "../../../src/modules/dashboard/dashboard.service.js";
import { PrismaDashboardRepository } from "../../../src/modules/dashboard/dashboard.repository.js";
import { createDashboardController } from "../../../src/modules/dashboard/dashboard.controller.js";
import { DashboardIntervalosResponseSchema } from "../../../src/modules/dashboard/dashboard.schema.js";

describe("Gráficos bajo demanda: consultas SQLite acotadas", () => {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-demanda-"));
  const url = `file:${dir}/test.db`;
  const consultas: string[] = [];
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [{ emit: "event", level: "query" }] });
  prisma.$on("query", e => consultas.push(e.query));
  const repo = new PrismaDashboardRepository(prisma);
  const service = new DashboardService(repo);
  let id: string; let sede: string; let otraSede: string;
  beforeAll(async () => {
    writeFileSync(join(dir, "test.db"), "");
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    await sembrarHistorico(prisma, { ahora: new Date("2026-10-15T08:00:00Z"), entorno: "test" });
    const m = await prisma.medidor.findUniqueOrThrow({ where: { codigo: "AG-NORTE-GENERAL" } });
    id = m.id; sede = m.instalacionId;
    otraSede = (await prisma.instalacion.findUniqueOrThrow({ where: { codigo: "SUR" } })).id;
  }, 30000);
  afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

  it("resumen sin series equivale al completo y materializa como máximo cuatro referencias por equipo", async () => {
    const completo = await service.obtenerGraficos({ limite: 100 });
    const compacto = await service.obtenerGraficos({ limite: 100, vista: "resumen" });
    expect(compacto.grupos.every(g => g.series.length === 0)).toBe(true);
    const totales = (r: typeof compacto) => r.grupos.flatMap(g => g.consumos).sort((a, b) => `${a.instalacionId}:${a.recurso}:${a.unidad}`.localeCompare(`${b.instalacionId}:${b.recurso}:${b.unidad}`));
    expect(totales(compacto)).toEqual(totales(completo));
    const data = await repo.getGraphSummaryData({ limite: 100 });
    expect(data.lecturas.length).toBeLessThanOrEqual(36 * 4);
    expect(compacto.grupos.flatMap(g => g.medidores)).toHaveLength(36);
    const filtro = { limite: 100, fechaInicio: new Date("2026-09-01T00:00:00Z"), fechaFin: new Date("2026-10-01T23:59:59Z") };
    expect(totales(await service.obtenerGraficos({ ...filtro, vista: "resumen" })))
      .toEqual(totales(await service.obtenerGraficos(filtro)));
  });

  it("pagina SQL reciente primero y conserva el anterior fuera de cada página/filtro", async () => {
    consultas.length = 0;
    const q = { medidorId: id, pagina: 1, tamanio: 30 };
    const primera = await service.obtenerIntervalos(q);
    expect(DashboardIntervalosResponseSchema.safeParse(primera).success).toBe(true);
    expect(primera).toMatchObject({ total: 61, totalPaginas: 3, pagina: 1 });
    expect(primera.items).toHaveLength(30);
    expect(primera.items.every(c => c.estado === "CALCULADO")).toBe(true);
    expect(primera.items[0].lecturaFinal!.fechaLectura > primera.items[29].lecturaFinal!.fechaLectura).toBe(true);
    expect(consultas.filter(s => s.includes('FROM `main`.`lecturas`')).every(s => s.includes("LIMIT"))).toBe(true);
    const segunda = await service.obtenerIntervalos({ ...q, pagina: 2 });
    expect(segunda.items).toHaveLength(30);
    expect(segunda.items.every(c => c.estado === "CALCULADO")).toBe(true);
    expect(segunda.items[0].lecturaFinal!.id).not.toBe(primera.items.at(-1)!.lecturaFinal!.id);
    const tercera = await service.obtenerIntervalos({ ...q, pagina: 3 });
    expect(tercera.items).toHaveLength(1); expect(tercera.items[0].consumo).toBeNull();
    const inicio = primera.items[0].lecturaFinal!.fechaLectura;
    const acotada = await service.obtenerIntervalos({ ...q, fechaInicio: inicio, fechaFin: inicio });
    expect(acotada.total).toBe(1); expect(acotada.items[0].consumo).toBe(primera.items[0].consumo);
  });

  it("conserva evidencia de factores desconocidos/cambiados y decrementos internos en resumen compacto", async () => {
    const lecturas = await prisma.lectura.findMany({ where: { medidorId: id }, orderBy: { fechaLectura: "asc" } });
    for (const cambio of [{ multiplicadorAplicado: null }, { multiplicadorAplicado: 2 }, { valor: 1 }]) {
      const original = lecturas[20];
      await prisma.lectura.update({ where: { id: original.id }, data: cambio });
      const q = { medidorId: id, limite: 100 };
      expect((await service.obtenerGraficos({ ...q, vista: "resumen" })).grupos[0].consumos)
        .toEqual((await service.obtenerGraficos(q)).grupos[0].consumos);
      expect((await repo.getGraphSummaryData(q)).lecturas.length).toBeLessThanOrEqual(4);
      await prisma.lectura.update({ where: { id: original.id }, data: { valor: original.valor, multiplicadorAplicado: original.multiplicadorAplicado } });
    }
  });

  it("fail-closed: scope ajeno no filtra datos; HTTP valida tamaños y rangos", async () => {
    const q = { medidorId: id, pagina: 1, tamanio: 30 };
    expect((await service.obtenerIntervalos(q, [otraSede])).items).toEqual([]);
    expect((await service.obtenerGraficos({ limite: 100, vista: "resumen" }, [])).grupos).toEqual([]);
    await expect(service.obtenerIntervalos({ ...q, instalacionId: sede }, [otraSede])).rejects.toMatchObject({ statusCode: 403 });
    const app = Fastify(); await app.register(createDashboardController(service), { prefix: "/api" });
    try {
      expect((await app.inject({ url: `/api/dashboard/intervalos?medidorId=${id}&tamanio=61` })).statusCode).toBe(400);
      expect((await app.inject({ url: `/api/dashboard/intervalos?medidorId=${id}&pagina=0` })).statusCode).toBe(400);
      expect((await app.inject({ url: `/api/dashboard/intervalos?medidorId=${id}&fechaInicio=2026-10-02&fechaFin=2026-10-01` })).statusCode).toBe(400);
      const r = await app.inject({ url: `/api/dashboard/intervalos?medidorId=${id}&tamanio=10` });
      expect(r.statusCode).toBe(200); expect(r.json().items).toHaveLength(10);
      expect((await app.inject({ url: "/api/dashboard/graficos?vista=resumen" })).json().grupos[0].series).toEqual([]);
    } finally { await app.close(); }
  });
});
