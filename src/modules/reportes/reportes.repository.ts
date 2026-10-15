import { calcularConsumo, construirBalance, EquipoConsumo } from "../consumos/consumos.service.js";
import { PrismaClient } from "@prisma/client";
import {
  IReportesRepository,
  ReporteRawItem,
  FacturaEntity,
} from "./reportes.service.js";
import { FiltroReporteConsumo } from "./reportes.schema.js";

export class PrismaReportesRepository implements IReportesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getReporteRawData(filtro: FiltroReporteConsumo, allowedInstalacionIds?: string[]): Promise<ReporteRawItem[]> {
    const whereMedidor: {
      instalacionId?: string | { in: string[] };
      id?: string;
      tipoMedidor?: { recurso?: string };
      activo?: boolean;
    } = {};

    if (filtro.instalacionId) {
      whereMedidor.instalacionId = filtro.instalacionId;
    } else if (allowedInstalacionIds) {
      whereMedidor.instalacionId = { in: allowedInstalacionIds };
    }
    if (filtro.recurso) {
      whereMedidor.tipoMedidor = { recurso: filtro.recurso };
    }

    const medidores = await this.prisma.medidor.findMany({
      where: { ...whereMedidor, createdAt: { lte: filtro.fechaFin } },
      include: {
        instalacion: true,
        tipoMedidor: true,
        vinculos: { orderBy: { vigenteDesde: "asc" } },
        lecturas: {
          where: {
            fechaLectura: {
              lte: filtro.fechaFin,
            },
          },
          orderBy: { fechaLectura: "asc" },
        },
      },
    });

    const equipos: EquipoConsumo[] = medidores.map(m => ({ ...m, recurso: m.tipoMedidor.recurso, unidad: m.tipoMedidor.unidad, tipoMedicion: m.tipoMedidor.tipoMedicion }));
    const balances = new Map([...new Set(medidores.map(m => m.instalacionId))].map(id =>
      [id, construirBalance(id, equipos.filter(m => m.instalacionId === id), filtro.fechaInicio, filtro.fechaFin)]));
    return medidores.filter(m => (!filtro.medidorId || m.id === filtro.medidorId) && (m.tipoMedidor.tipoMedicion === "ACUMULATIVO" || m.activo)).map(m => {
      const eq = equipos.find(e => e.id === m.id)!;
      const balance = balances.get(m.instalacionId)!;
      const nodo = balance.nodos.find(n => n.medidorId === m.id);
      return {
        medidorId: m.id, medidorCodigo: m.codigo, instalacionId: m.instalacionId, instalacionNombre: m.instalacion.nombre,
        recurso: m.tipoMedidor.recurso, unidad: m.tipoMedidor.unidad, tipoMedicion: m.tipoMedidor.tipoMedicion,
        medidorPadreId: nodo?.medidorPadreId ?? null, participaEnTotal: nodo?.participaEnTotal ?? true,
        balanceComparable: balance.totales.find(t => t.recurso === eq.recurso && t.unidad === eq.unidad)?.estado !== "NO_COMPARABLE",
        consumoTemporal: m.tipoMedidor.tipoMedicion === "ACUMULATIVO" ? calcularConsumo(eq, filtro.fechaInicio, filtro.fechaFin) : undefined,
        lecturas: m.tipoMedidor.tipoMedicion === "ACUMULATIVO" ? m.lecturas : m.lecturas.filter(l => l.fechaLectura >= filtro.fechaInicio),
      };
    });
  }

  async getRecargas(medidorIds: string[], fechaInicio: Date, fechaFin: Date): Promise<{ medidorId: string; volumen: number; fecha: Date }[]> {
    if (medidorIds.length === 0) return [];
    const regs = await this.prisma.registroMantenimiento.findMany({
      where: {
        medidorId: { in: medidorIds },
        tipo: "RECARGA_TANQUE",
        fechaMantenimiento: { gte: fechaInicio, lte: fechaFin },
      },
      select: { medidorId: true, volumenRecargado: true, fechaMantenimiento: true },
    });
    return regs.map((r) => ({
      medidorId: r.medidorId,
      volumen: (r as unknown as { volumenRecargado?: number | null }).volumenRecargado ?? 0,
      fecha: r.fechaMantenimiento,
    }));
  }

  async createFactura(data: Omit<FacturaEntity, "id" | "createdAt" | "updatedAt">): Promise<FacturaEntity> {
    const created = await this.prisma.facturaServicio.create({
      data: {
        instalacionId: data.instalacionId,
        recurso: data.recurso,
        periodoInicio: data.periodoInicio,
        periodoFin: data.periodoFin,
        consumoFacturado: data.consumoFacturado,
        unidad: data.unidad,
        montoTotal: data.montoTotal,
        numeroFactura: data.numeroFactura,
        estadoConciliacion: data.estadoConciliacion,
        consumoMedido: data.consumoMedido,
        diferenciaConsumo: data.diferenciaConsumo,
        porcentajeDesvio: data.porcentajeDesvio,
        notas: data.notas,
      },
    });
    return created as FacturaEntity;
  }

  async listFacturas(instalacionId?: string, allowedInstalacionIds?: string[]): Promise<FacturaEntity[]> {
    let where: { instalacionId?: string | { in: string[] } } | undefined = undefined;
    if (instalacionId) {
      where = { instalacionId };
    } else if (allowedInstalacionIds) {
      where = { instalacionId: { in: allowedInstalacionIds } };
    }
    const facturas = await this.prisma.facturaServicio.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return facturas as FacturaEntity[];
  }
}
