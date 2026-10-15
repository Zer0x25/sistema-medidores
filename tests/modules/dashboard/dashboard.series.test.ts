import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import {
  DashboardService,
  IDashboardRepository,
  DashboardRawData,
} from "../../../src/modules/dashboard/dashboard.service.js";
import { createDashboardController } from "../../../src/modules/dashboard/dashboard.controller.js";
import { DashboardGraficosResponseSchema } from "../../../src/modules/dashboard/dashboard.schema.js";

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

  it("gráficos muestran deltas 30 y 20, primera lectura desconocida y cero confirmado", async () => {
    const resultado = await service.obtenerGraficos({ medidorId: med1, limite: 100 });
    expect(DashboardGraficosResponseSchema.safeParse(resultado).success).toBe(true);
    expect(resultado.grupos[0].series[0].puntos.map(p => p.valor)).toEqual([null, 30, 20]);
    expect(resultado.grupos[0].series[0].puntos[1].detalle).toMatchObject({
      lecturaInicial: { valor: 100, fechaLectura: t0 }, lecturaFinal: { valor: 130, fechaLectura: t1 },
    });
    repository.data.lecturas.push({ id: "igual", medidorId: med1, valor: 150, fechaLectura: t3, operadorId: "op1" });
    const cero = await service.obtenerGraficos({ medidorId: med1, limite: 1 });
    expect(cero.grupos[0].series[0].puntos[0].valor).toBe(0);
    expect(cero.grupos[0].consumos[0].consumoNeto).toBe(50);
  });

  it("filtro y límite mantienen la lectura anterior fuera del rango sin multiplicar dos veces", async () => {
    repository.data.lecturas.forEach(l => { l.multiplicadorAplicado = 10; });
    const r = await service.obtenerGraficos({ medidorId: med1, fechaInicio: t1, fechaFin: t2, limite: 1 });
    expect(r.grupos[0].series[0].puntos.map(p => p.valor)).toEqual([20]);
    expect(r.grupos[0].consumos[0]).toMatchObject({ consumoNeto: 20, fechaInicialReal: t1, fechaFinalReal: t2 });
    const previo = await service.obtenerGraficos({ medidorId: med1, fechaInicio: new Date(t0.getTime() + 1), fechaFin: t1, limite: 1 });
    expect(previo.grupos[0].series[0].puntos[0].valor).toBe(30);
    expect(previo.grupos[0].consumos[0]).toMatchObject({ consumoNeto: 30, cobertura: "PARCIAL", fechaInicialReal: t0 });
  });

  it.each([null, 2])("no dibuja como cero intervalos con factor %s incompatible", async factor => {
    repository.data.lecturas.find(l => l.id === "l3")!.multiplicadorAplicado = factor;
    const r = await service.obtenerGraficos({ medidorId: med1, limite: 100 });
    expect(r.grupos[0].series[0].puntos.map(p => p.valor)).toEqual([null, null, null]);
    expect(r.grupos[0].series[0].puntos[1].detalle.estado).toBe("NO_COMPARABLE");
    expect(r.grupos[0].consumos[0].consumoNeto).toBeNull();
  });

  it("no confunde decrementos ni modos NIVEL/INSTANTANEO con consumo acumulativo", async () => {
    repository.data.lecturas.find(l => l.id === "l2")!.valor = 120;
    repository.data.medidores[1].tipoMedicion = "INSTANTANEO";
    repository.data.medidores[2].tipoMedicion = "NIVEL";
    const r = await service.obtenerGraficos({ limite: 100 });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].series).toHaveLength(1);
    expect(r.grupos[0].series[0].puntos.at(-1)).toMatchObject({ valor: null, detalle: { motivo: "LECTURAS_INCOHERENTES" } });
  });

  it("agrega por raíces históricas incluso archivadas, y seleccionar hijo usa su consumo propio", async () => {
    const hijo = repository.data.medidores[1];
    Object.assign(hijo, { recurso: "AGUA", unidad: "M3", medidorPadreId: med1,
      vinculos: [{ medidorPadreId: med1, vigenteDesde: new Date(0) }] });
    repository.data.lecturas.push(
      { id: "h0", medidorId: med2, valor: 490, fechaLectura: t0, operadorId: "op1" },
      { id: "h2", medidorId: med2, valor: 510, fechaLectura: t2, operadorId: "op1" },
    );
    repository.data.medidores[0].activo = false;
    const r = await service.obtenerGraficos({ instalacionId: inst1, limite: 1 });
    expect(r.grupos[0].consumos[0].consumoNeto).toBe(50);
    expect(r.grupos[0].series).toHaveLength(1);
    const propio = await service.obtenerGraficos({ medidorId: med2, limite: 1 });
    expect(propio.grupos[0].consumos[0].consumoNeto).toBe(20);
  });

  it("separa unidades, conserva insuficientes y aplica scope/filtros AND", async () => {
    repository.data.medidores[1].recurso = "AGUA";
    const r = await service.obtenerGraficos({ instalacionId: inst1, recurso: "AGUA", limite: 100 }, [inst1]);
    expect(r.grupos.map(g => g.unidad).sort()).toEqual(["KWH", "M3"]);
    expect(r.grupos.find(g => g.unidad === "KWH")!.consumos[0].consumoNeto).toBeNull();
    expect((await service.obtenerGraficos({ limite: 100 }, [])).grupos).toEqual([]);
    expect((await service.obtenerGraficos({ medidorId: med3, limite: 100 }, [inst1])).grupos).toEqual([]);
    await expect(service.obtenerGraficos({ instalacionId: inst2, limite: 100 }, [inst1])).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.obtenerGraficos({ fechaInicio: t2, fechaFin: t0, limite: 100 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("no ofrece porcentajes entre sedes con períodos reales distintos o datos incompletos", async () => {
    expect((await service.obtenerGraficos({ recurso: "AGUA", limite: 100 })).grupos[0].distribucionComparable).toBe(false);
    repository.data.lecturas = repository.data.lecturas.filter(l => l.medidorId !== med3);
    repository.data.lecturas.push(
      { id: "s1", medidorId: med3, valor: 10, fechaLectura: t1, operadorId: "op1" },
      { id: "s2", medidorId: med3, valor: 30, fechaLectura: t2, operadorId: "op1" },
    );
    const diferentes = await service.obtenerGraficos({ recurso: "AGUA", limite: 100 });
    expect(diferentes.grupos[0].consumos.map(c => c.estadoConsumo)).toEqual(["CALCULADO", "CALCULADO"]);
    expect(diferentes.grupos[0].distribucionComparable).toBe(false);
    const alineados = await service.obtenerGraficos({ recurso: "AGUA", fechaInicio: t1, fechaFin: t2, limite: 100 });
    expect(alineados.grupos[0].distribucionComparable).toBe(true);
    expect(alineados.grupos[0].consumos.map(c => c.consumoNeto)).toEqual([20, 20]);
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

  it("GET /graficos entrega consumo, valida query y protege el territorio", async () => {
    app = await buildApp([inst1]);
    const res = await app.inject({ url: "/api/dashboard/graficos" });
    expect(res.statusCode).toBe(200);
    expect(res.json().grupos[0].series[0].puntos.map((p: { valor: number | null }) => p.valor)).toEqual([null, 50]);
    expect((await app.inject({ url: "/api/dashboard/graficos?limite=0" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/dashboard/graficos?instalacionId=22222222-2222-4222-8222-222222222222" })).statusCode).toBe(403);
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
