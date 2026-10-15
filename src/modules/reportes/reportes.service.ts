import { calcularConsumo } from "../consumos/consumos.service.js";
import { ConsumoResponse } from "../consumos/consumos.schema.js";
import {
  FiltroReporteConsumo,
  FiltroReporteConsumoSchema,
  ItemConsumoConsolidado,
  RegistrarFacturaInput,
  RegistrarFacturaInputSchema,
  FacturaConciliadaResponse,
  RangoFechasInvalidoError,
  InstalacionNoAsignadaError,
} from "./reportes.schema.js";

export interface ReporteLecturaRaw {
  id?: string;
  multiplicadorAplicado?: number | null;
  valor: number;
  fechaLectura: Date;
}

export interface ReporteRawItem {
  medidorPadreId?: string | null;
  participaEnTotal?: boolean;
  balanceComparable?: boolean;
  consumoTemporal?: ConsumoResponse;
  medidorId: string;
  medidorCodigo: string;
  instalacionId: string;
  instalacionNombre: string;
  recurso: string;
  unidad: string;
  tipoMedicion: string;
  lecturas: ReporteLecturaRaw[];
}

export interface RecargaRawItem {
  medidorId: string;
  volumen: number;
  fecha: Date;
}

export interface FacturaEntity {
  id: string;
  instalacionId: string;
  recurso: string;
  periodoInicio: Date;
  periodoFin: Date;
  consumoFacturado: number;
  unidad: string;
  montoTotal?: number | null;
  numeroFactura?: string | null;
  estadoConciliacion: "PENDIENTE" | "CONCILIADO" | "DISCREPANCIA";
  consumoMedido?: number | null;
  diferenciaConsumo?: number | null;
  porcentajeDesvio?: number | null;
  notas?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReportesRepository {
  getReporteRawData(filtro: FiltroReporteConsumo, allowedInstalacionIds?: string[]): Promise<ReporteRawItem[]>;
  getRecargas(medidorIds: string[], fechaInicio: Date, fechaFin: Date): Promise<RecargaRawItem[]>;
  createFactura(data: Omit<FacturaEntity, "id" | "createdAt" | "updatedAt">): Promise<FacturaEntity>;
  listFacturas(instalacionId?: string, allowedInstalacionIds?: string[]): Promise<FacturaEntity[]>;
}

export class ReportesService {
  constructor(private readonly repository: IReportesRepository) {}

  async obtenerConsumoConsolidado(
    rawFiltro: FiltroReporteConsumo,
    allowedInstalacionIds?: string[]
  ): Promise<ItemConsumoConsolidado[]> {
    if (rawFiltro.fechaInicio > rawFiltro.fechaFin) {
      throw new RangoFechasInvalidoError(rawFiltro.fechaInicio, rawFiltro.fechaFin);
    }
    const filtro = FiltroReporteConsumoSchema.parse(rawFiltro);

    if (filtro.instalacionId && allowedInstalacionIds && !allowedInstalacionIds.includes(filtro.instalacionId)) {
      throw new InstalacionNoAsignadaError(filtro.instalacionId);
    }

    const rawItems = await this.repository.getReporteRawData(filtro, allowedInstalacionIds);

    const medidorIds = rawItems.map((i) => i.medidorId);
    const recargas = medidorIds.length > 0
      ? await this.repository.getRecargas(medidorIds, filtro.fechaInicio, filtro.fechaFin)
      : [];
    const recargasPorMedidor = new Map<string, number>();
    for (const r of recargas) {
      recargasPorMedidor.set(r.medidorId, (recargasPorMedidor.get(r.medidorId) || 0) + r.volumen);
    }

    const resultado: ItemConsumoConsolidado[] = [];

    for (const item of rawItems) {
      if (item.lecturas.length === 0 && item.tipoMedicion !== "ACUMULATIVO") continue;

      // Ordenar por fecha cronológica ascendente
      const ordenadas = [...item.lecturas].sort(
        (a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime()
      );

      const lecturaInicial = ordenadas[0]?.valor ?? 0;
      const lecturaFinal = ordenadas[ordenadas.length - 1]?.valor ?? 0;
      let consumoNeto = 0;

      const consumoTemporal = item.tipoMedicion === "ACUMULATIVO" ? item.consumoTemporal ?? calcularConsumo({
        id: item.medidorId, unidad: item.unidad, tipoMedicion: item.tipoMedicion,
        lecturas: ordenadas.map((l, i) => ({ ...l, id: l.id ?? String(i) })),
      }, filtro.fechaInicio, filtro.fechaFin) : undefined;
      if (item.tipoMedicion === "ACUMULATIVO") {
        consumoNeto = consumoTemporal?.consumo ?? 0;
      } else if (item.tipoMedicion === "NIVEL") {
        const bajadaNeta = Math.max(0, Number((lecturaInicial - lecturaFinal).toFixed(2)));
        const recargaTotal = Number((recargasPorMedidor.get(item.medidorId) || 0).toFixed(2));
        consumoNeto = Number((bajadaNeta + recargaTotal).toFixed(2));
      } else {
        // INSTANTANEO (potencia/caudal): promedio del periodo
        const suma = ordenadas.reduce((acc, curr) => acc + curr.valor, 0);
        consumoNeto = Number((suma / ordenadas.length).toFixed(2));
      }

      resultado.push({
        medidorId: item.medidorId,
        medidorCodigo: item.medidorCodigo,
        instalacionId: item.instalacionId,
        instalacionNombre: item.instalacionNombre,
        recurso: item.recurso,
        unidad: item.unidad,
        lecturaInicial: consumoTemporal?.lecturaInicial?.valor ?? lecturaInicial,
        lecturaFinal: consumoTemporal?.lecturaFinal?.valor ?? lecturaFinal,
        consumoTemporal,
        estadoConsumo: consumoTemporal?.estado,
        medidorPadreId: item.medidorPadreId ?? null,
        participaEnTotal: item.participaEnTotal ?? !item.medidorPadreId,
        balanceComparable: item.balanceComparable ?? true,
        consumoNeto,
        totalLecturas: ordenadas.length,
        fechaInicio: filtro.fechaInicio,
        fechaFin: filtro.fechaFin,
      });
    }

    return resultado;
  }

  async exportarConsumoCSV(
    rawFiltro: FiltroReporteConsumo,
    allowedInstalacionIds?: string[]
  ): Promise<string> {
    const consolidado = await this.obtenerConsumoConsolidado(rawFiltro, allowedInstalacionIds);

    const cabeceras = [
      "Sede",
      "Medidor",
      "TipoRecurso",
      "Unidad",
      "LecturaInicial",
      "LecturaFinal",
      "ConsumoNeto",
      "FechaInicio",
      "FechaFin", "MedidorPadre", "ParticipaEnTotal", "EstadoConsumo", "FechaInicialReal", "FechaFinalReal",
    ];

    const filas = consolidado.map((c) => [
      `"${c.instalacionNombre.replace(/"/g, '""')}"`,
      c.medidorCodigo,
      c.recurso,
      c.unidad,
      c.consumoTemporal ? c.consumoTemporal.lecturaInicial?.valor ?? "" : c.lecturaInicial,
      c.consumoTemporal ? c.consumoTemporal.lecturaFinal?.valor ?? "" : c.lecturaFinal,
      c.consumoTemporal && c.consumoTemporal.estado !== "CALCULADO" ? "" : c.consumoNeto,
      c.fechaInicio.toISOString().split("T")[0],
      c.fechaFin.toISOString().split("T")[0],
      c.medidorPadreId ?? "", c.participaEnTotal !== false ? "SI" : "NO", c.estadoConsumo ?? "CALCULADO",
      c.consumoTemporal?.lecturaInicial?.fechaLectura.toISOString() ?? "", c.consumoTemporal?.lecturaFinal?.fechaLectura.toISOString() ?? "",
    ]);

    return [cabeceras.join(","), ...filas.map((f) => f.join(","))].join("\n");
  }

  async registrarYConciliarFactura(
    rawInput: RegistrarFacturaInput,
    allowedInstalacionIds?: string[]
  ): Promise<FacturaConciliadaResponse> {
    const input = RegistrarFacturaInputSchema.parse(rawInput);

    if (allowedInstalacionIds && !allowedInstalacionIds.includes(input.instalacionId)) {
      throw new InstalacionNoAsignadaError(input.instalacionId);
    }

    // Obtener consumo medido para la sede y recurso en el rango de fechas
    const consolidado = await this.obtenerConsumoConsolidado(
      {
        instalacionId: input.instalacionId,
        recurso: input.recurso,
        fechaInicio: input.periodoInicio,
        fechaFin: input.periodoFin,
      },
      allowedInstalacionIds
    );

    let consumoMedido: number | null = null;
    let diferenciaConsumo: number | null = null;
    let porcentajeDesvio: number | null = null;
    let estadoConciliacion: "PENDIENTE" | "CONCILIADO" | "DISCREPANCIA" = "PENDIENTE";

    const raices = consolidado.filter(c => c.participaEnTotal !== false && c.unidad === input.unidad);
    const ref = raices[0]?.consumoTemporal;
    const comparables = raices.length > 0 && raices.every(c => c.balanceComparable !== false && (!c.consumoTemporal || (
      c.consumoTemporal.estado === "CALCULADO" && c.consumoTemporal.cobertura === "COMPLETA"
      && c.consumoTemporal.lecturaInicial?.fechaLectura.getTime() === ref?.lecturaInicial?.fechaLectura.getTime()
      && c.consumoTemporal.lecturaFinal?.fechaLectura.getTime() === ref?.lecturaFinal?.fechaLectura.getTime()
    )));
    if (comparables) {
      // Suma de consumos netos de todos los medidores de ese recurso en la sede
      const totalConsumoMedido = raices.reduce((acc, curr) => acc + curr.consumoNeto, 0);
      consumoMedido = Number(totalConsumoMedido.toFixed(2));
      diferenciaConsumo = Number((input.consumoFacturado - consumoMedido).toFixed(2));

      if (consumoMedido > 0) {
        porcentajeDesvio = Number(
          (((input.consumoFacturado - consumoMedido) / consumoMedido) * 100).toFixed(2)
        );
        // Tolerancia del 5%
        if (Math.abs(porcentajeDesvio) <= 5.0) {
          estadoConciliacion = "CONCILIADO";
        } else {
          estadoConciliacion = "DISCREPANCIA";
        }
      } else {
        estadoConciliacion = "DISCREPANCIA";
      }
    }

    const factura = await this.repository.createFactura({
      instalacionId: input.instalacionId,
      recurso: input.recurso,
      periodoInicio: input.periodoInicio,
      periodoFin: input.periodoFin,
      consumoFacturado: input.consumoFacturado,
      unidad: input.unidad,
      montoTotal: input.montoTotal ?? null,
      numeroFactura: input.numeroFactura ?? null,
      estadoConciliacion,
      consumoMedido,
      diferenciaConsumo,
      porcentajeDesvio,
      notas: input.notas ?? null,
    });

    return {
      id: factura.id,
      instalacionId: factura.instalacionId,
      recurso: factura.recurso,
      numeroFactura: factura.numeroFactura ?? null,
      periodoInicio: factura.periodoInicio,
      periodoFin: factura.periodoFin,
      consumoFacturado: factura.consumoFacturado,
      consumoMedido: factura.consumoMedido ?? null,
      diferenciaConsumo: factura.diferenciaConsumo ?? null,
      porcentajeDesvio: factura.porcentajeDesvio ?? null,
      estadoConciliacion: factura.estadoConciliacion,
      unidad: factura.unidad,
      montoTotal: factura.montoTotal ?? null,
      notas: factura.notas ?? null,
      createdAt: factura.createdAt,
    };
  }

  async listarFacturas(instalacionId?: string, allowedInstalacionIds?: string[]): Promise<FacturaConciliadaResponse[]> {
    if (instalacionId && allowedInstalacionIds && !allowedInstalacionIds.includes(instalacionId)) {
      throw new InstalacionNoAsignadaError(instalacionId);
    }
    const list = await this.repository.listFacturas(instalacionId, allowedInstalacionIds);
    return list.map((factura) => ({
      id: factura.id,
      instalacionId: factura.instalacionId,
      recurso: factura.recurso,
      numeroFactura: factura.numeroFactura ?? null,
      periodoInicio: factura.periodoInicio,
      periodoFin: factura.periodoFin,
      consumoFacturado: factura.consumoFacturado,
      consumoMedido: factura.consumoMedido ?? null,
      diferenciaConsumo: factura.diferenciaConsumo ?? null,
      porcentajeDesvio: factura.porcentajeDesvio ?? null,
      estadoConciliacion: factura.estadoConciliacion,
      unidad: factura.unidad,
      montoTotal: factura.montoTotal ?? null,
      notas: factura.notas ?? null,
      createdAt: factura.createdAt,
    }));
  }
}
