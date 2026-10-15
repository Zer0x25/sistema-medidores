import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sembrarHistorico } from "../scripts/seed-historico.js";
import { DashboardService } from "../src/modules/dashboard/dashboard.service.js";
import { PrismaDashboardRepository } from "../src/modules/dashboard/dashboard.repository.js";
import { construirBalance } from "../src/modules/consumos/consumos.service.js";
import { PrismaConsumosRepository } from "../src/modules/consumos/consumos.repository.js";
import { verifyPassword } from "../src/modules/usuarios/auth.utils.js";

describe("Semilla histórica de dos meses en SQLite aislado", () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-historico-"));
  const url = `file:${dir}/test.db`;
  const prisma: PrismaClient = new PrismaClient({ datasources: { db: { url } } });
  const ahora = new Date("2026-10-15T10:00:00.000Z");
  beforeAll(() => {
    writeFileSync(join(dir, "test.db"), "");
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], {
      env: { ...process.env, DATABASE_URL: url }, stdio: "pipe",
    });
  }, 30000);
  afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

  it("rechaza producción y staging antes de escribir", async () => {
    for (const entorno of ["production", "staging"] as const) {
      await expect(sembrarHistorico(prisma, { ahora, entorno })).rejects.toMatchObject({ code: "SEED_ENTORNO_PROHIBIDO" });
    }
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("crea historia comparable, variación diaria, jerarquías y accesos demo válidos", async () => {
    const r = await sembrarHistorico(prisma, { ahora, entorno: "test" });
    expect(r).toMatchObject({ instalaciones: 3, medidores: 36, lecturas: 2196, intervalos: 60 });
    expect(r.fin.getTime() - r.inicio.getTime()).toBe(60 * 86400000);
    expect(r.fin < ahora).toBe(true);
    expect(await prisma.medidorVinculo.count()).toBe(27);
    const equipos = await prisma.medidor.findMany({ include: { lecturas: { orderBy: { fechaLectura: "asc" } }, vinculos: true } });
    for (const m of equipos) {
      expect(m.createdAt < r.inicio).toBe(true);
      expect(m.lecturas).toHaveLength(61);
      const deltas: number[] = [];
      m.lecturas.forEach((l, i) => {
        expect(l.fechaLectura.getTime()).toBe(r.inicio.getTime() + i * 86400000);
        expect(l.multiplicadorAplicado).toBe(1);
        expect(l.valor).toBe(l.valorBruto);
        if (i) { expect(l.valor).toBeGreaterThan(m.lecturas[i - 1].valor); deltas.push(l.valor - m.lecturas[i - 1].valor); }
      });
      expect(new Set(deltas.map(d => d.toFixed(2))).size).toBeGreaterThan(20);
      if (m.medidorPadreId) expect(m.vinculos[0]).toMatchObject({ medidorPadreId: m.medidorPadreId });
    }
    const graficos = await new DashboardService(new PrismaDashboardRepository(prisma)).obtenerGraficos({ limite: 100 });
    expect(graficos.grupos).toHaveLength(3);
    for (const g of graficos.grupos) {
      expect(g.distribucionComparable).toBe(true);
      expect(g.consumos).toHaveLength(3);
      expect(g.consumos.every(c => c.estadoConsumo === "CALCULADO" && c.cobertura === "COMPLETA")).toBe(true);
      for (const s of g.series) {
        expect(s.puntos[0].valor).toBeNull();
        expect(s.puntos.slice(1).every(p => p.valor !== null && p.detalle.estado === "CALCULADO")).toBe(true);
      }
    }
    const repo = new PrismaConsumosRepository(prisma);
    for (const inst of await prisma.instalacion.findMany()) {
      const ms = (await repo.obtenerInstalacion(inst.id, r.fin))!;
      const balance = construirBalance(inst.id, ms, r.inicio, r.fin);
      expect(balance.nodos).toHaveLength(12);
      expect(balance.nodos.some(n => n.profundidad === 2)).toBe(true);
      expect(balance.nodos.every(n => n.estado === "CALCULADO" && n.saldoSinDistribuir! > 0)).toBe(true);
      expect(balance.nodos.filter(n => n.participaEnTotal)).toHaveLength(3);
    }
    for (const user of await prisma.usuario.findMany()) expect(await verifyPassword("demo1234", user.passwordHash)).toBe(true);
    expect(await prisma.asignacionOperador.count()).toBe(4);
  });

  it("rechaza repetir la semilla sin alterar datos existentes", async () => {
    await expect(sembrarHistorico(prisma, { ahora, entorno: "test" })).rejects.toMatchObject({ code: "SEED_BASE_NO_VACIA" });
    expect(await prisma.lectura.count()).toBe(2196);
    expect(await prisma.usuario.count()).toBe(3);
  });
});
