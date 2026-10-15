import { calcularConsumo, construirBalance, EquipoConsumo, VinculoConsumo } from "../consumos/consumos.service.js";
import {
  DashboardKpisResponse,
  MedidorDesatendido,
  ConsumoPorInstalacion,
  ActividadRecienteLectura,
  DashboardSerieMedidor,
  DashboardSerieQuery,
  InstalacionNoAsignadaError,
  RangoFechasInvalidoError,
  DashboardGraficosResponse,
  DashboardGraficosQuery,
  DashboardIntervalosQuery,
  DashboardIntervalosResponse,
} from "./dashboard.schema.js";

export interface RawInstalacion {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface RawMedidor {
  medidorPadreId?: string | null;
  vinculos?: VinculoConsumo[];
  createdAt?: Date;
  id: string;
  codigo: string;
  instalacionId: string;
  instalacionNombre: string;
  ubicacionInterna: string;
  recurso: string;
  unidad: string;
  tipoMedicion: string;
  activo: boolean;
}

export interface RawLectura {
  multiplicadorAplicado?: number | null;
  id: string;
  medidorId: string;
  valor: number;
  fechaLectura: Date;
  operadorId: string;
  notas?: string | null;
}

export interface DashboardRawData {
  instalaciones: RawInstalacion[];
  medidores: RawMedidor[];
  lecturas: RawLectura[];
  recargas: RawRecarga[];
}

export interface RawRecarga {
  medidorId: string;
  volumen: number;
  fecha: Date;
}

export interface IDashboardRepository {
  getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData>;
  getGraphSummaryData?(filtro: DashboardSerieQuery, allowedInstalacionIds?: string[]): Promise<DashboardRawData>;
  getIntervalos?(filtro: DashboardIntervalosQuery, allowedInstalacionIds?: string[]): Promise<{ medidor: RawMedidor | null; lecturas: RawLectura[]; total: number }>;
}

export class DashboardService {
  constructor(private readonly repository: IDashboardRepository) {}

  async obtenerGraficos(filtro: DashboardGraficosQuery, allowedInstalacionIds?: string[]): Promise<DashboardGraficosResponse> {
    if (filtro.fechaInicio && filtro.fechaFin && filtro.fechaInicio > filtro.fechaFin) {
      throw new RangoFechasInvalidoError(filtro.fechaInicio, filtro.fechaFin);
    }
    if (filtro.instalacionId && allowedInstalacionIds !== undefined && !allowedInstalacionIds.includes(filtro.instalacionId)) {
      throw new InstalacionNoAsignadaError(filtro.instalacionId);
    }
    const data = filtro.vista === "resumen" && this.repository.getGraphSummaryData
      ? await this.repository.getGraphSummaryData(filtro, allowedInstalacionIds)
      : await this.repository.getDashboardData(allowedInstalacionIds);
    const equipos: EquipoConsumo[] = data.medidores.filter(m => m.tipoMedicion === "ACUMULATIVO"
      && (allowedInstalacionIds === undefined || allowedInstalacionIds.includes(m.instalacionId))
      && (!filtro.instalacionId || m.instalacionId === filtro.instalacionId)
      && (!filtro.medidorId || (m.id === filtro.medidorId && m.activo))
      && (!filtro.recurso || m.recurso === filtro.recurso))
      .map(m => ({ ...m, createdAt: m.createdAt ?? new Date(0), medidorPadreId: m.medidorPadreId ?? null,
        vinculos: m.vinculos ?? [], lecturas: data.lecturas.filter(l => l.medidorId === m.id)
          .sort((a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime() || a.valor - b.valor) }))
      .filter(m => m.activo || m.lecturas.length > 0);
    const grupos: DashboardGraficosResponse["grupos"] = [];
    for (const equipo of equipos) {
      if (grupos.some(g => g.recurso === equipo.recurso && g.unidad === equipo.unidad)) continue;
      const miembros = equipos.filter(m => m.recurso === equipo.recurso && m.unidad === equipo.unidad);
      const series = (filtro.vista === "resumen" ? [] : miembros.filter(m => m.activo)).map(m => ({
        medidorId: m.id, medidorCodigo: m.codigo, instalacionId: m.instalacionId,
        instalacionNombre: data.medidores.find(raw => raw.id === m.id)!.instalacionNombre,
        recurso: m.recurso, unidad: m.unidad,
        puntos: m.lecturas.map((l, i) => {
          const detalle = calcularConsumo({ ...m, lecturas: m.lecturas.slice(Math.max(0, i - 1), i + 1) });
          return { fecha: l.fechaLectura, valor: detalle.consumo, detalle };
        }).filter(p => (!filtro.fechaInicio || p.fecha >= filtro.fechaInicio) && (!filtro.fechaFin || p.fecha <= filtro.fechaFin))
          .slice(-(filtro.limite ?? 100)),
      }));
      const consumos: DashboardGraficosResponse["grupos"][number]["consumos"] = [];
      for (const instalacionId of new Set(miembros.map(m => m.instalacionId))) {
        const sede = miembros.filter(m => m.instalacionId === instalacionId);
        const fechas = sede.flatMap(m => m.lecturas.map(l => l.fechaLectura.getTime()));
        const inicio = filtro.fechaInicio ?? new Date(fechas.reduce((a, b) => Math.min(a, b), fechas[0] ?? 0));
        const fin = filtro.fechaFin ?? new Date(fechas.reduce((a, b) => Math.max(a, b), fechas[0] ?? 0));
        const propio = filtro.medidorId ? calcularConsumo(sede[0], inicio, fin) : null;
        const total = propio ? {
          consumo: propio.consumo, estado: propio.estado === "NO_APLICA" ? "NO_COMPARABLE" as const : propio.estado,
          cobertura: propio.cobertura, fechaInicialReal: propio.lecturaInicial?.fechaLectura ?? null,
          fechaFinalReal: propio.lecturaFinal?.fechaLectura ?? null,
        } : construirBalance(instalacionId, sede, inicio, fin).totales[0];
        consumos.push({ instalacionId,
          instalacionNombre: data.medidores.find(m => m.instalacionId === instalacionId)!.instalacionNombre,
          recurso: equipo.recurso, unidad: equipo.unidad, consumoNeto: total?.consumo ?? null,
          estadoConsumo: total?.estado ?? "DATOS_INSUFICIENTES", cobertura: total?.cobertura ?? "INSUFICIENTE",
          fechaInicialReal: total?.fechaInicialReal ?? null, fechaFinalReal: total?.fechaFinalReal ?? null,
          cantidadMedidores: sede.length,
        });
      }
      const referencia = consumos[0];
      const distribucionComparable = consumos.length > 0 && consumos.every(c => c.estadoConsumo === "CALCULADO"
        && c.fechaInicialReal?.getTime() === referencia.fechaInicialReal?.getTime()
        && c.fechaFinalReal?.getTime() === referencia.fechaFinalReal?.getTime());
      const medidores = miembros.filter(m => m.activo).map(m => ({ medidorId: m.id, medidorCodigo: m.codigo,
        instalacionId: m.instalacionId, instalacionNombre: data.medidores.find(raw => raw.id === m.id)!.instalacionNombre }));
      grupos.push({ recurso: equipo.recurso, unidad: equipo.unidad, series, medidores, consumos, distribucionComparable });
    }
    return { grupos };
  }

  async obtenerIntervalos(filtro: DashboardIntervalosQuery, allowedInstalacionIds?: string[]): Promise<DashboardIntervalosResponse> {
    if (filtro.fechaInicio && filtro.fechaFin && filtro.fechaInicio > filtro.fechaFin) throw new RangoFechasInvalidoError(filtro.fechaInicio, filtro.fechaFin);
    if (filtro.instalacionId && allowedInstalacionIds !== undefined && !allowedInstalacionIds.includes(filtro.instalacionId)) throw new InstalacionNoAsignadaError(filtro.instalacionId);
    // Adaptadores antiguos mantienen compatibilidad; Prisma usa siempre la consulta paginada.
    let data: { medidor: RawMedidor | null; lecturas: RawLectura[]; total: number };
    if (this.repository.getIntervalos) data = await this.repository.getIntervalos(filtro, allowedInstalacionIds);
    else {
      const raw = await this.repository.getDashboardData(allowedInstalacionIds);
      const medidor = raw.medidores.find(m => m.id === filtro.medidorId && m.activo
        && (!filtro.instalacionId || m.instalacionId === filtro.instalacionId)
        && (!filtro.recurso || m.recurso === filtro.recurso)) ?? null;
      const todas = raw.lecturas.filter(l => l.medidorId === medidor?.id).sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());
      const cierres = todas.filter(l => (!filtro.fechaInicio || l.fechaLectura >= filtro.fechaInicio) && (!filtro.fechaFin || l.fechaLectura <= filtro.fechaFin));
      const pagina = cierres.slice((filtro.pagina - 1) * filtro.tamanio, filtro.pagina * filtro.tamanio);
      const anterior = todas.find(l => pagina.at(-1) && l.fechaLectura < pagina.at(-1)!.fechaLectura);
      data = { medidor, lecturas: anterior ? [...pagina, anterior] : pagina, total: cierres.length };
    }
    const items = data.medidor ? data.lecturas.slice(0, Math.min(filtro.tamanio, Math.max(0, data.total - (filtro.pagina - 1) * filtro.tamanio)))
      .map((l, i) => calcularConsumo({ id: data.medidor!.id, unidad: data.medidor!.unidad, tipoMedicion: data.medidor!.tipoMedicion,
        lecturas: data.lecturas[i + 1] ? [data.lecturas[i + 1], l] : [l] })) : [];
    return { medidorCodigo: data.medidor?.codigo ?? null, unidad: data.medidor?.unidad ?? null,
      pagina: filtro.pagina, tamanio: filtro.tamanio, total: data.total, totalPaginas: Math.ceil(data.total / filtro.tamanio), items };
  }

  async obtenerKpis(allowedInstalacionIds?: string[]): Promise<DashboardKpisResponse> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);

    const instalacionesActivas = data.instalaciones.filter((i) => i.activa);
    const medidoresActivos = data.medidores.filter((m) => m.activo);

    const medidoresPorRecurso: Record<string, number> = {};
    for (const m of medidoresActivos) {
      medidoresPorRecurso[m.recurso] = (medidoresPorRecurso[m.recurso] || 0) + 1;
    }

    return {
      totalInstalaciones: instalacionesActivas.length,
      totalMedidores: medidoresActivos.length,
      medidoresPorRecurso,
      totalLecturas: data.lecturas.length,
    };
  }

  async obtenerMedidoresDesatendidos(horasUmbral = 24, allowedInstalacionIds?: string[]): Promise<MedidorDesatendido[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresActivos = data.medidores.filter((m) => m.activo);
    const now = Date.now();
    const umbralMs = horasUmbral * 3600 * 1000;

    const desatendidos: MedidorDesatendido[] = [];

    for (const m of medidoresActivos) {
      const lecturasMedidor = data.lecturas
        .filter((l) => l.medidorId === m.id)
        .sort((a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime());

      if (lecturasMedidor.length === 0) {
        desatendidos.push({
          medidorId: m.id,
          codigo: m.codigo,
          instalacionId: m.instalacionId,
          instalacionNombre: m.instalacionNombre,
          ubicacionInterna: m.ubicacionInterna,
          ultimaLecturaFecha: null,
          horasSinLectura: null,
        });
      } else {
        const ultima = lecturasMedidor[0];
        const diffMs = now - ultima.fechaLectura.getTime();
        if (diffMs >= umbralMs) {
          const horasSinLectura = Math.floor(diffMs / (3600 * 1000));
          desatendidos.push({
            medidorId: m.id,
            codigo: m.codigo,
            instalacionId: m.instalacionId,
            instalacionNombre: m.instalacionNombre,
            ubicacionInterna: m.ubicacionInterna,
            ultimaLecturaFecha: ultima.fechaLectura,
            horasSinLectura,
          });
        }
      }
    }

    return desatendidos;
  }

  async obtenerConsumoPorInstalacion(allowedInstalacionIds?: string[]): Promise<ConsumoPorInstalacion[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresActivos = data.medidores.filter(m => m.activo || (m.tipoMedicion === "ACUMULATIVO" && data.lecturas.some(l => l.medidorId === m.id)));

    // Agrupar por clave: `${instalacionId}:${recurso}`
    const grupos = new Map<
      string,
      {
        instalacionId: string;
        instalacionNombre: string;
        recurso: string;
        unidad: string;
        medidores: RawMedidor[];
      }
    >();

    for (const m of medidoresActivos) {
      const key = `${m.instalacionId}:${m.recurso}:${m.unidad}`;
      const grupo = grupos.get(key) || {
        instalacionId: m.instalacionId,
        instalacionNombre: m.instalacionNombre,
        recurso: m.recurso,
        unidad: m.unidad,
        medidores: [],
      };
      grupo.medidores.push(m);
      grupos.set(key, grupo);
    }

    const resultado: ConsumoPorInstalacion[] = [];

    for (const grupo of grupos.values()) {
      let consumoNetoTotal = 0;

      for (const m of grupo.medidores) {
        if (m.tipoMedicion === "ACUMULATIVO") {
          // Los acumulativos se agregan una única vez por grupo, usando sus raíces históricas.
          continue;
        } else if (m.tipoMedicion === "NIVEL") {
          const lecturas = data.lecturas
            .filter((l) => l.medidorId === m.id)
            .sort((a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime());

          if (lecturas.length >= 1) {
            const inicial = lecturas[0].valor;
            const fin = lecturas[lecturas.length - 1].valor;
            const bajada = Math.max(0, inicial - fin);
            const recargaTotal = (data.recargas || [])
              .filter((r) => r.medidorId === m.id)
              .reduce((acc, r) => acc + r.volumen, 0);
            consumoNetoTotal += bajada + recargaTotal;
          }
        } else if (m.tipoMedicion === "INSTANTANEO") {
          const lecturas = data.lecturas.filter((l) => l.medidorId === m.id);
          if (lecturas.length >= 1) {
            const suma = lecturas.reduce((acc, l) => acc + l.valor, 0);
            consumoNetoTotal += suma / lecturas.length;
          }
        }
      }

      const acumulativos: EquipoConsumo[] = grupo.medidores.filter(m => m.tipoMedicion === "ACUMULATIVO").map(m => ({
        ...m, medidorPadreId: m.medidorPadreId ?? null, vinculos: m.vinculos ?? [], createdAt: m.createdAt ?? new Date(0),
        lecturas: data.lecturas.filter(l => l.medidorId === m.id),
      }));
      const fechas = acumulativos.flatMap(m => m.lecturas.map(l => l.fechaLectura.getTime()));
      const balance = acumulativos.length ? construirBalance(grupo.instalacionId, acumulativos,
        new Date(fechas.reduce((a, b) => Math.min(a, b), fechas[0] ?? 0)), new Date(fechas.reduce((a, b) => Math.max(a, b), 0))) : null;
      const total = balance?.totales[0];
      consumoNetoTotal += total?.consumo ?? 0;
      consumoNetoTotal = Number(consumoNetoTotal.toFixed(2));

      resultado.push({
        instalacionId: grupo.instalacionId,
        instalacionNombre: grupo.instalacionNombre,
        recurso: grupo.recurso,
        unidad: grupo.unidad,
        consumoNeto: consumoNetoTotal,
        estadoConsumo: total?.estado ?? "CALCULADO",
        fechaInicialReal: total?.fechaInicialReal ?? null,
        fechaFinalReal: total?.fechaFinalReal ?? null,
        cantidadMedidores: grupo.medidores.length,
      });
    }

    return resultado;
  }

  async obtenerActividadReciente(limit = 10, allowedInstalacionIds?: string[]): Promise<ActividadRecienteLectura[]> {
    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const medidoresMap = new Map(data.medidores.map((m) => [m.id, m]));

    const ordenadas = [...data.lecturas].sort(
      (a, b) => b.fechaLectura.getTime() - a.fechaLectura.getTime()
    );

    const seleccionadas = ordenadas.slice(0, limit);

    return seleccionadas.map((l) => {
      const medidor = medidoresMap.get(l.medidorId);
      const unidad = medidor ? medidor.unidad : "OTRO";
      return {
        id: l.id,
        medidorId: l.medidorId,
        medidorCodigo: medidor ? medidor.codigo : "DESCONOCIDO",
        instalacionNombre: medidor ? medidor.instalacionNombre : "DESCONOCIDA",
        recurso: medidor ? medidor.recurso : "OTRO",
        unidad,
        unidadMedida: unidad,
        valor: l.valor,
        fechaLectura: l.fechaLectura,
        timestamp: l.fechaLectura,
        fecha: l.fechaLectura,
        operadorId: l.operadorId,
        notas: l.notas,
        observaciones: l.notas,
      };
    });
  }

  /**
   * Series temporales por medidor para gráficos (feat-028, solo lectura).
   * Filtros combinables en AND + fail-closed territorial.
   */
  async obtenerSeries(
    filtro: DashboardSerieQuery,
    allowedInstalacionIds?: string[]
  ): Promise<DashboardSerieMedidor[]> {
    if (filtro.fechaInicio && filtro.fechaFin && filtro.fechaInicio > filtro.fechaFin) {
      throw new RangoFechasInvalidoError(filtro.fechaInicio, filtro.fechaFin);
    }
    if (
      filtro.instalacionId &&
      allowedInstalacionIds !== undefined &&
      !allowedInstalacionIds.includes(filtro.instalacionId)
    ) {
      throw new InstalacionNoAsignadaError(filtro.instalacionId);
    }

    const data = await this.repository.getDashboardData(allowedInstalacionIds);
    const limite = filtro.limite ?? 100;

    const medidores = data.medidores.filter((m) => {
      if (!m.activo) return false;
      if (filtro.medidorId && m.id !== filtro.medidorId) return false;
      if (filtro.instalacionId && m.instalacionId !== filtro.instalacionId) return false;
      if (filtro.recurso && m.recurso !== filtro.recurso) return false;
      return true;
    });

    return medidores.map((m) => {
      const puntos = data.lecturas
        .filter((l) => l.medidorId === m.id)
        .filter((l) => {
          const t = l.fechaLectura.getTime();
          if (filtro.fechaInicio && t < filtro.fechaInicio.getTime()) return false;
          if (filtro.fechaFin && t > filtro.fechaFin.getTime()) return false;
          return true;
        })
        .sort((a, b) => {
          const diff = a.fechaLectura.getTime() - b.fechaLectura.getTime();
          if (diff !== 0) return diff;
          return a.valor - b.valor;
        })
        .slice(-limite)
        .map((l) => ({ fecha: l.fechaLectura, valor: l.valor }));

      return {
        medidorId: m.id,
        medidorCodigo: m.codigo,
        instalacionId: m.instalacionId,
        instalacionNombre: m.instalacionNombre,
        recurso: m.recurso,
        unidad: m.unidad,
        puntos,
      };
    });
  }
}
