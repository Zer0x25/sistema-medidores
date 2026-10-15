import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import {
  DashboardService,
  IDashboardRepository,
  DashboardRawData,
} from "../../../src/modules/dashboard/dashboard.service.js";
import { createDashboardController } from "../../../src/modules/dashboard/dashboard.controller.js";

class InMemorySeriesRepo implements IDashboardRepository {
  public data: DashboardRawData = { instalaciones: [], medidores: [], lecturas: [], recargas: [] };

  async getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData> {
    if (allowedInstalacionIds === undefined) return this.data;
    const allowed = new Set(allowedInstalacionIds);
    const instalaciones = this.data.instalaciones.filter((i) => allowed.has(i.id));
    const medidores = this.data.medidores.filter((m) => allowed.has(m.instalacionId));
    const ids = new Set(medidores.map((m) => m.id));
    return {
      instalaciones,
      medidores,
      lecturas: this.data.lecturas.filter((l) => ids.has(l.medidorId)),
      recargas: (this.data.recargas || []).filter((r) => ids.has(r.medidorId)),
    };
  }
}

describe("DashboardSeries Suite (feat-028 Fase Roja)", () => {
  let repository: InMemorySeriesRepo;
  let service: DashboardService;

  const inst1 = "11111111-1111-4111-8111-111111111111";
  const inst2 = "22222222-2222-4222-8222-222222222222";
  const med1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const med2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const med3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const t0 = new Date("2026-01-01T00:00:00.000Z");
  const t1 = new Date("2026-01-02T00:00:00.000Z");
  const t2 = new Date("2026-01-03T00:00:00.000Z");
  const t3 = new Date("2026-01-04T00:00:00.000Z");

  beforeEach(() => {
    repository = new InMemorySeriesRepo();
    service = new DashboardService(repository);
    repository.data = {
      instalaciones: [
        { id: inst1, nombre: "Planta Norte", activa: true },
        { id: inst2, nombre: "Planta Sur", activa: true },
      ],
      medidores: [
        { id: med1, codigo: "MED-AG-01", instalacionId: inst1, instalacionNombre: "Planta Norte", ubicacionInterna: "Sala 1", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO", activo: true },
        { id: med2, codigo: "MED-LUZ-01", instalacionId: inst1, instalacionNombre: "Planta Norte", ubicacionInterna: "Sala 2", recurso: "LUZ", unidad: "KWH", tipoMedicion: "ACUMULATIVO", activo: true },
        { id: med3, codigo: "MED-AG-02", instalacionId: inst2, instalacionNombre: "Planta Sur", ubicacionInterna: "Sala 3", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO", activo: true },
      ],
      lecturas: [
        { id: "l1", medidorId: med1, valor: 100, fechaLectura: t0, operadorId: "op1", notas: null },
        { id: "l2", medidorId: med1, valor: 150, fechaLectura: t2, operadorId: "op1", notas: null },
        { id: "l3", medidorId: med1, valor: 130, fechaLectura: t1, operadorId: "op1", notas: null },
        { id: "l4", medidorId: med2, valor: 500, fechaLectura: t1, operadorId: "op1", notas: null },
        { id: "l5", medidorId: med3, valor: 10, fechaLectura: t3, operadorId: "op1", notas: null },
      ],
      recargas: [],
    };
  });

  it("filtra por medidorId y retorna puntos ascendentes", async () => {
    const series = await service.obtenerSeries({ medidorId: med1, limite: 100 });
    expect(series.length).toBe(1);
    expect(series[0].medidorCodigo).toBe("MED-AG-01");
    expect(series[0].puntos.map((p) => p.valor)).toEqual([100, 130, 150]);
  });

  it("filtra por instalacionId + recurso en AND", async () => {
    const series = await service.obtenerSeries({ instalacionId: inst1, recurso: "LUZ", limite: 100 });
    expect(series.length).toBe(1);
    expect(series[0].medidorId).toBe(med2);
  });

  it("respeta rango de fechas y limite (capado a mas recientes)", async () => {
    const series = await service.obtenerSeries({
      medidorId: med1,
      fechaInicio: t0,
      fechaFin: t1,
      limite: 100,
    });
    expect(series[0].puntos.map((p) => p.valor)).toEqual([100, 130]);

    const capada = await service.obtenerSeries({ medidorId: med1, limite: 2 });
    expect(capada[0].puntos.map((p) => p.valor)).toEqual([130, 150]);
  });

  it("inicio > fin arroja RANGO_FECHAS_INVALIDO (400)", async () => {
    await expect(
      service.obtenerSeries({ fechaInicio: t2, fechaFin: t0, limite: 100 })
    ).rejects.toMatchObject({ code: "RANGO_FECHAS_INVALIDO", statusCode: 400 });
  });

  it("instalacionId ajena con scope arroja INSTALACION_NO_ASIGNADA (403); scope vacio retorna []", async () => {
    await expect(
      service.obtenerSeries({ instalacionId: inst2, limite: 100 }, [inst1])
    ).rejects.toMatchObject({ code: "INSTALACION_NO_ASIGNADA", statusCode: 403 });

    const vacio = await service.obtenerSeries({ limite: 100 }, []);
    expect(vacio).toEqual([]);

    const propio = await service.obtenerSeries({ limite: 100 }, [inst1]);
    expect(propio.every((s) => s.instalacionId === inst1)).toBe(true);
  });

  it("medidor sin lecturas en rango retorna puntos [] sin omitir", async () => {
    const series = await service.obtenerSeries({
      medidorId: med2,
      fechaInicio: t2,
      fechaFin: t3,
      limite: 100,
    });
    expect(series.length).toBe(1);
    expect(series[0].puntos).toEqual([]);
  });
});

describe("DashboardSeriesController HTTP (feat-028)", () => {
  let app: FastifyInstance;

  const inst1 = "11111111-1111-4111-8111-111111111111";
  const med1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  async function buildApp(allowed?: string[]): Promise<FastifyInstance> {
    const repo = new InMemorySeriesRepo();
    repo.data = {
      instalaciones: [{ id: inst1, nombre: "Planta Norte", activa: true }],
      medidores: [
        { id: med1, codigo: "MED-AG-01", instalacionId: inst1, instalacionNombre: "Planta Norte", ubicacionInterna: "S1", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO", activo: true },
      ],
      lecturas: [
        { id: "l1", medidorId: med1, valor: 100, fechaLectura: new Date("2026-01-01T00:00:00.000Z"), operadorId: "op1", notas: null },
        { id: "l2", medidorId: med1, valor: 150, fechaLectura: new Date("2026-01-02T00:00:00.000Z"), operadorId: "op1", notas: null },
      ],
      recargas: [],
    };
    const service = new DashboardService(repo);
    const instance = Fastify();
    instance.addHook("preHandler", async (request) => {
      (request as unknown as { user?: { allowedInstalacionIds?: string[] } }).user =
        allowed === undefined ? undefined : { allowedInstalacionIds: allowed };
    });
    await instance.register(createDashboardController(service), { prefix: "/api" });
    await instance.ready();
    return instance;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  it("GET /api/dashboard/series retorna 200 con forma valida", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/dashboard/series?limite=10" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ medidorId: string; puntos: Array<{ fecha: string; valor: number }> }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].puntos.length).toBe(2);
  });

  it("query invalida (limite=0, uuid roto) retorna 400", async () => {
    app = await buildApp();
    const r1 = await app.inject({ method: "GET", url: "/api/dashboard/series?limite=0" });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({ method: "GET", url: "/api/dashboard/series?medidorId=no-uuid" });
    expect(r2.statusCode).toBe(400);
  });

  it("scope ajeno retorna 403", async () => {
    app = await buildApp(["00000000-0000-4000-8000-000000000000"]);
    const res = await app.inject({
      method: "GET",
      url: `/api/dashboard/series?instalacionId=${inst1}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("INSTALACION_NO_ASIGNADA");
  });
});
