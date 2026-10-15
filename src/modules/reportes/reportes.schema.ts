import { ConsumoResponseSchema } from "../consumos/consumos.schema.js";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";

// Errores de dominio tipados
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

export class InstalacionReporteNotFoundError extends DomainError {
  readonly code = "INSTALACION_NOT_FOUND";
  readonly statusCode = 404;

  constructor(instalacionId: string) {
    super(`La instalación con ID «${instalacionId}» no fue encontrada.`, { instalacionId });
  }
}

export class FacturaNotFoundError extends DomainError {
  readonly code = "FACTURA_NOT_FOUND";
  readonly statusCode = 404;

  constructor(facturaId: string) {
    super(`La factura con ID «${facturaId}» no fue encontrada.`, { facturaId });
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

// Filtro para consolidación y exportación
export const FiltroReporteConsumoSchema = z.object({
  instalacionId: z.string().uuid().optional(),
  medidorId: z.string().uuid().optional(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]).optional(),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date(),
}).refine((data) => data.fechaInicio <= data.fechaFin, {
  message: "La fechaInicio no puede ser posterior a fechaFin",
  path: ["fechaInicio"],
});
export type FiltroReporteConsumo = z.infer<typeof FiltroReporteConsumoSchema>;

// Fila de consumo consolidado
export const ItemConsumoConsolidadoSchema = z.object({
  medidorPadreId: z.string().nullable().optional(), participaEnTotal: z.boolean().optional(), balanceComparable: z.boolean().optional(),
  consumoTemporal: ConsumoResponseSchema.optional(), estadoConsumo: z.enum(["CALCULADO", "DATOS_INSUFICIENTES", "NO_COMPARABLE", "NO_APLICA"]).optional(),
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  lecturaInicial: z.number(),
  lecturaFinal: z.number(),
  consumoNeto: z.number(),
  totalLecturas: z.number(),
  fechaInicio: z.date(),
  fechaFin: z.date(),
});
export type ItemConsumoConsolidado = z.infer<typeof ItemConsumoConsolidadoSchema>;

// Registro de factura para conciliación
export const RegistrarFacturaInputSchema = z.object({
  instalacionId: z.string().uuid(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]),
  numeroFactura: z.string().trim().min(1).optional(),
  periodoInicio: z.coerce.date(),
  periodoFin: z.coerce.date(),
  consumoFacturado: z.number().positive("El consumo facturado debe ser mayor a 0"),
  unidad: z.string().trim().min(1),
  montoTotal: z.number().nonnegative().optional(),
  notas: z.string().trim().max(500).optional(),
}).refine((data) => data.periodoInicio < data.periodoFin, {
  message: "El periodoInicio debe ser anterior a periodoFin",
  path: ["periodoInicio"],
});
export type RegistrarFacturaInput = z.infer<typeof RegistrarFacturaInputSchema>;

// Resultado de conciliación de factura
export const FacturaConciliadaResponseSchema = z.object({
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  recurso: z.string(),
  numeroFactura: z.string().nullable(),
  periodoInicio: z.date(),
  periodoFin: z.date(),
  consumoFacturado: z.number(),
  consumoMedido: z.number().nullable(),
  diferenciaConsumo: z.number().nullable(),
  porcentajeDesvio: z.number().nullable(),
  estadoConciliacion: z.enum(["PENDIENTE", "CONCILIADO", "DISCREPANCIA"]),
  unidad: z.string(),
  montoTotal: z.number().nullable(),
  notas: z.string().nullable(),
  createdAt: z.date(),
});
export type FacturaConciliadaResponse = z.infer<typeof FacturaConciliadaResponseSchema>;
