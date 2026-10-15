import { describe, it, expect, beforeEach } from "vitest";
import {
  ReportesService,
  IReportesRepository,
  ReporteRawItem,
  FacturaEntity,
} from "../../../src/modules/reportes/reportes.service.js";
import {
  RangoFechasInvalidoError,
} from "../../../src/modules/reportes/reportes.schema.js";

class InMemoryReportesRepository implements IReportesRepository {
  public rawItems: ReporteRawItem[] = [];
  public facturas: FacturaEntity[] = [];
  public recargas: { medidorId: string; volumen: number; fecha: Date }[] = [];

  async getReporteRawData(): Promise<ReporteRawItem[]> {
    return this.rawItems;
  }

  async getRecargas(medidorIds: string[]): Promise<{ medidorId: string; volumen: number; fecha: Date }[]> {
    return this.recargas.filter((r) => medidorIds.includes(r.medidorId));
  }

  async createFactura(data: Omit<FacturaEntity, "id" | "createdAt" | "updatedAt">): Promise<FacturaEntity> {
    const factura: FacturaEntity = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.facturas.push(factura);
    return factura;
  }

  async listFacturas(instalacionId?: string): Promise<FacturaEntity[]> {
    if (instalacionId) {
      return this.facturas.filter((f) => f.instalacionId === instalacionId);
    }
    return this.facturas;
  }
}

describe("ReportesService Suite (Agentic TDD)", () => {
  let repo: InMemoryReportesRepository;
  let service: ReportesService;

  const instId = crypto.randomUUID();
  const medidorId = crypto.randomUUID();

  beforeEach(() => {
    repo = new InMemoryReportesRepository();
    service = new ReportesService(repo);
  });

  describe("Cálculo de Consumo Neto Consolidado", () => {
    it("debe calcular correctamente el consumo neto para un medidor acumulativo", async () => {
      const fechaInicio = new Date("2026-09-01T00:00:00Z");
      const fechaFin = new Date("2026-09-30T23:59:59Z");

      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Planta Central",
          recurso: "AGUA",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 100.0, fechaLectura: new Date("2026-09-01T00:00:00Z") },
            { valor: 150.0, fechaLectura: new Date("2026-09-15T08:00:00Z") },
            { valor: 220.0, fechaLectura: new Date("2026-09-30T18:00:00Z") },
          ],
        },
      ];

      const resultado = await service.obtenerConsumoConsolidado({
        fechaInicio,
        fechaFin,
        instalacionId: instId,
      });

      expect(resultado).toHaveLength(1);
      expect(resultado[0].medidorCodigo).toBe("MED-AG-01");
      expect(resultado[0].lecturaInicial).toBe(100.0);
      expect(resultado[0].lecturaFinal).toBe(220.0);
      expect(resultado[0].consumoNeto).toBe(120.0);
      expect(resultado[0].totalLecturas).toBe(3);
    });

    it("debe lanzar RangoFechasInvalidoError si fechaInicio es posterior a fechaFin", async () => {
      await expect(
        service.obtenerConsumoConsolidado({
          fechaInicio: new Date("2026-10-02T00:00:00Z"),
          fechaFin: new Date("2026-10-01T00:00:00Z"),
        })
      ).rejects.toThrow(RangoFechasInvalidoError);
    });

    it("debe calcular consumo NIVEL como bajada neta más recargas (feat-024)", async () => {
      const fechaInicio = new Date("2026-09-01T00:00:00Z");
      const fechaFin = new Date("2026-09-30T23:59:59Z");
      const medNivel = crypto.randomUUID();

      repo.rawItems = [
        {
          medidorId: medNivel,
          medidorCodigo: "MED-DIE-01",
          instalacionId: instId,
          instalacionNombre: "Patio Tanques",
          recurso: "PETROLEO",
          unidad: "LITROS",
          tipoMedicion: "NIVEL",
          lecturas: [
            { valor: 4800, fechaLectura: new Date("2026-09-05T08:00:00Z") },
            { valor: 4200, fechaLectura: new Date("2026-09-20T08:00:00Z") },
          ],
        },
      ];
      repo.recargas = [
        { medidorId: medNivel, volumen: 1000, fecha: new Date("2026-09-12T08:00:00Z") },
      ];

      const res = await service.obtenerConsumoConsolidado({ fechaInicio, fechaFin });
      expect(res).toHaveLength(1);
      expect(res[0].consumoNeto).toBe(1600); // (4800-4200)+1000
    });

    it("debe calcular consumo INSTANTANEO como promedio (feat-024)", async () => {
      const fechaInicio = new Date("2026-09-01T00:00:00Z");
      const fechaFin = new Date("2026-09-30T23:59:59Z");
      const medInst = crypto.randomUUID();

      repo.rawItems = [
        {
          medidorId: medInst,
          medidorCodigo: "MED-POT-01",
          instalacionId: instId,
          instalacionNombre: "Sala Eléctrica",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "INSTANTANEO",
          lecturas: [
            { valor: 10, fechaLectura: new Date("2026-09-01T00:00:00Z") },
            { valor: 20, fechaLectura: new Date("2026-09-15T08:00:00Z") },
            { valor: 30, fechaLectura: new Date("2026-09-30T08:00:00Z") },
          ],
        },
      ];

      const res = await service.obtenerConsumoConsolidado({ fechaInicio, fechaFin });
      expect(res).toHaveLength(1);
      expect(res[0].consumoNeto).toBe(20);
    });
  });

  describe("Generación y Descarga en CSV", () => {
    it("debe generar un CSV formateado con cabeceras y delimitado por comas", async () => {
      const fechaInicio = new Date("2026-09-01T00:00:00Z");
      const fechaFin = new Date("2026-09-30T23:59:59Z");

      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-LUZ-01",
          instalacionId: instId,
          instalacionNombre: "Planta Central",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 1000.0, fechaLectura: new Date("2026-09-01T00:00:00Z") },
            { valor: 1450.0, fechaLectura: new Date("2026-09-30T10:00:00Z") },
          ],
        },
      ];

      const csv = await service.exportarConsumoCSV({
        fechaInicio,
        fechaFin,
      });

      expect(csv).toContain("Sede,Medidor,TipoRecurso,Unidad,LecturaInicial,LecturaFinal,ConsumoNeto,FechaInicio,FechaFin");
      expect(csv).toContain('"Planta Central",MED-LUZ-01,LUZ,KWH,1000,1450,450');
    });
  });

  describe("Auditoría y Conciliación contra Facturas de Servicios", () => {
    it("debe conciliar exitosamente (estado CONCILIADO) cuando la desviación es <= 5%", async () => {
      const inicio = new Date("2026-08-01T00:00:00Z");
      const fin = new Date("2026-08-31T23:59:59Z");

      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-AG-01",
          instalacionId: instId,
          instalacionNombre: "Sede Norte",
          recurso: "AGUA",
          unidad: "M3",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 500.0, fechaLectura: inicio },
            { valor: 600.0, fechaLectura: fin }, // Consumo interno = 100 m3
          ],
        },
      ];

      // Factura de 103 m3 (desvío +3%, dentro del rango del 5%)
      const factura = await service.registrarYConciliarFactura({
        instalacionId: instId,
        recurso: "AGUA",
        numeroFactura: "FAC-2026-0881",
        periodoInicio: inicio,
        periodoFin: fin,
        consumoFacturado: 103.0,
        unidad: "M3",
        montoTotal: 154000,
        notas: "Factura Aguas Andinas Agosto",
      });

      expect(factura.estadoConciliacion).toBe("CONCILIADO");
      expect(factura.consumoMedido).toBe(100.0);
      expect(factura.diferenciaConsumo).toBe(3.0);
      expect(factura.porcentajeDesvio).toBe(3.0);
    });

    it("debe marcar DISCREPANCIA si la diferencia supera el 5%", async () => {
      const inicio = new Date("2026-08-01T00:00:00Z");
      const fin = new Date("2026-08-31T23:59:59Z");

      repo.rawItems = [
        {
          medidorId,
          medidorCodigo: "MED-LUZ-01",
          instalacionId: instId,
          instalacionNombre: "Sede Norte",
          recurso: "LUZ",
          unidad: "KWH",
          tipoMedicion: "ACUMULATIVO",
          lecturas: [
            { valor: 10000.0, fechaLectura: inicio },
            { valor: 11000.0, fechaLectura: fin }, // Consumo interno = 1000 kWh
          ],
        },
      ];

      // Factura de 1200 kWh (desvío +20% > 5%)
      const factura = await service.registrarYConciliarFactura({
        instalacionId: instId,
        recurso: "LUZ",
        numeroFactura: "FAC-LUZ-99",
        periodoInicio: inicio,
        periodoFin: fin,
        consumoFacturado: 1200.0,
        unidad: "KWH",
        montoTotal: 340000,
      });

      expect(factura.estadoConciliacion).toBe("DISCREPANCIA");
      expect(factura.consumoMedido).toBe(1000.0);
      expect(factura.diferenciaConsumo).toBe(200.0);
      expect(factura.porcentajeDesvio).toBe(20.0);
    });

    it("debe marcar PENDIENTE si no existen lecturas para el recurso y período", async () => {
      const inicio = new Date("2026-01-01T00:00:00Z");
      const fin = new Date("2026-01-31T23:59:59Z");

      repo.rawItems = [];

      const factura = await service.registrarYConciliarFactura({
        instalacionId: instId,
        recurso: "GAS",
        numeroFactura: "FAC-GAS-01",
        periodoInicio: inicio,
        periodoFin: fin,
        consumoFacturado: 450.0,
        unidad: "M3",
      });

      expect(factura.estadoConciliacion).toBe("PENDIENTE");
      expect(factura.consumoMedido).toBeNull();
      expect(factura.diferenciaConsumo).toBeNull();
    });
  });
});
