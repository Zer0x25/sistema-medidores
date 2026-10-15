import { construirBalance, EquipoConsumo, VinculoConsumo } from "../consumos/consumos.service.js";
import {
  DashboardKpisResponse,
  MedidorDesatendido,
  ConsumoPorInstalacion,
  ActividadRecienteLectura,
  DashboardSerieMedidor,
  DashboardSerieQuery,
  InstalacionNoAsignadaError,
  RangoFechasInvalidoError,
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
}

export class DashboardService {
  constructor(private readonly repository: IDashboardRepository) {}

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
