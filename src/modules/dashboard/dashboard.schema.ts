import { z } from "zod";
import { DomainError } from "../../core/errors.js";

// ==============================================================================
// DTOs para Dashboard de Administración
// ==============================================================================

// --- Errores de dominio tipados (feat-028) ---

export class RangoFechasInvalidoError extends DomainError {
  readonly code = "RANGO_FECHAS_INVALIDO";
  readonly statusCode = 400;

  constructor(fechaInicio: Date, fechaFin: Date) {
    super(
      `El rango de fechas es inválido: fechaInicio (${fechaInicio.toISOString()}) no puede ser posterior a fechaFin (${fechaFin.toISOString()}).`,
      { fechaInicio, fechaFin }
    );
  }
}

export class InstalacionNoAsignadaError extends DomainError {
  readonly code = "INSTALACION_NO_ASIGNADA";
  readonly statusCode = 403;

  constructor(instalacionId: string) {
    super(`Acceso denegado: el usuario no tiene asignada la instalación «${instalacionId}».`, {
      instalacionId,
    });
  }
}

export type DashboardErrorCode = "RANGO_FECHAS_INVALIDO" | "INSTALACION_NO_ASIGNADA";

export const DashboardKpisResponseSchema = z.object({
  totalInstalaciones: z.number().int().nonnegative(),
  totalMedidores: z.number().int().nonnegative(),
  medidoresPorRecurso: z.record(z.string(), z.number().int().nonnegative()),
  totalLecturas: z.number().int().nonnegative(),
});

export type DashboardKpisResponse = z.infer<typeof DashboardKpisResponseSchema>;

export const MedidorDesatendidoSchema = z.object({
  medidorId: z.string().uuid(),
  codigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  ubicacionInterna: z.string(),
  ultimaLecturaFecha: z.date().nullable(),
  horasSinLectura: z.number().nullable(),
});

export type MedidorDesatendido = z.infer<typeof MedidorDesatendidoSchema>;

export const ConsumoPorInstalacionSchema = z.object({
  estadoConsumo: z.enum(["CALCULADO", "NO_COMPARABLE", "DATOS_INSUFICIENTES"]).optional(),
  fechaInicialReal: z.date().nullable().optional(), fechaFinalReal: z.date().nullable().optional(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  consumoNeto: z.number(),
  cantidadMedidores: z.number().int().nonnegative(),
});

export type ConsumoPorInstalacion = z.infer<typeof ConsumoPorInstalacionSchema>;

export const ActividadRecienteLecturaSchema = z.object({
  id: z.string().uuid(),
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  unidadMedida: z.string().optional(),
  valor: z.number(),
  fechaLectura: z.date(),
  timestamp: z.date().optional(),
  fecha: z.date().optional(),
  operadorId: z.string().uuid(),
  notas: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
});

export type ActividadRecienteLectura = z.infer<typeof ActividadRecienteLecturaSchema>;

// ------------------------------------------------------------------------------
// Series temporales para gráficos (feat-028)
// ------------------------------------------------------------------------------

export const DashboardSerieQuerySchema = z.object({
  medidorId: z.string().uuid().optional(),
  instalacionId: z.string().uuid().optional(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]).optional(),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});

export type DashboardSerieQuery = z.infer<typeof DashboardSerieQuerySchema>;

export const DashboardSeriePuntoSchema = z.object({
  fecha: z.date(),
  valor: z.number(),
});

export type DashboardSeriePunto = z.infer<typeof DashboardSeriePuntoSchema>;

export const DashboardSerieMedidorSchema = z.object({
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  puntos: z.array(DashboardSeriePuntoSchema).max(500),
});

export type DashboardSerieMedidor = z.infer<typeof DashboardSerieMedidorSchema>;
