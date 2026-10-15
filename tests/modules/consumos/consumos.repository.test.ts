import { expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

it("adopta una base anterior conservando IDs, lecturas y factores, con todos los padres nulos", async () => {
  const dir = mkdtempSync(join(tmpdir(), "remarcadores-legacy-"));
  const url = `file:${dir}/legacy.db`;
  writeFileSync(join(dir, "legacy.db"), "");
  const anterior = readFileSync(resolve("tests/fixtures/feat-028-schema.prisma"), "utf8");
  writeFileSync(join(dir, "legacy.prisma"), anterior);
  const push = (schema: string) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", schema], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const prisma: PrismaClient = new PrismaClient({ datasources: { db: { url } } });
  const id = crypto.randomUUID(); const tipo = crypto.randomUUID(); const inst = crypto.randomUUID(); const lectura = crypto.randomUUID();
  try {
    push(join(dir, "legacy.prisma"));
    await prisma.$executeRaw`INSERT INTO instalaciones (id, nombre, ubicacion, updatedAt) VALUES (${inst}, 'Sede anterior', 'Norte', CURRENT_TIMESTAMP)`;
    await prisma.$executeRaw`INSERT INTO tipos_medidor (id, nombre, recurso, unidad, tipoMedicion, updatedAt) VALUES (${tipo}, 'Tipo anterior', 'AGUA', 'M3', 'ACUMULATIVO', CURRENT_TIMESTAMP)`;
    await prisma.$executeRaw`INSERT INTO medidores (id, instalacionId, tipoMedidorId, codigo, ubicacionInterna, factorInstalacion, updatedAt) VALUES (${id}, ${inst}, ${tipo}, 'ANTERIOR', 'Sala', 20, CURRENT_TIMESTAMP)`;
    await prisma.$executeRaw`INSERT INTO lecturas (id, medidorId, operadorId, valor, multiplicadorAplicado) VALUES (${lectura}, ${id}, 'operador-anterior', 1250, 20)`;
    await prisma.$disconnect();
    push(resolve("prisma/schema.prisma"));
    const despues = await prisma.medidor.findUniqueOrThrow({ where: { id }, include: { lecturas: true, vinculos: true } });
    expect(despues.medidorPadreId).toBeNull(); expect(despues.factorInstalacion).toBe(20); expect(despues.vinculos).toEqual([]);
    expect(despues.lecturas).toHaveLength(1); expect(despues.lecturas[0]).toMatchObject({ id: lectura, valor: 1250, multiplicadorAplicado: 20 });
  } finally { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
}, 30000);
