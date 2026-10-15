import { z } from "zod";
import { DomainError } from "../../core/errors.js";

export const MotivoConsumoSchema = z.enum([
  "SIN_LECTURA_INICIAL", "SIN_LECTURA_FINAL", "SIN_DOS_LECTURAS",
  "FACTOR_NO_COMPARABLE", "LECTURAS_INCOHERENTES", "MODO_NO_ACUMULATIVO",
]);
export const PuntoConsumoSchema = z.object({
  id: z.string(), valor: z.number(), fechaLectura: z.date(), timestamp: z.date(), fecha: z.date(),
  multiplicadorAplicado: z.number().nullable(),
});
const base = z.object({
  medidorId: z.string(), unidad: z.string(),
  lecturaInicial: PuntoConsumoSchema.nullable(), lecturaFinal: PuntoConsumoSchema.nullable(),
  fechaInicioSolicitada: z.date().nullable(), fechaFinSolicitada: z.date().nullable(),
  cobertura: z.enum(["COMPLETA", "PARCIAL", "INSUFICIENTE"]),
});
export const ConsumoResponseSchema = z.discriminatedUnion("estado", [
  base.extend({ estado: z.literal("CALCULADO"), consumo: z.number(), motivo: z.null() }),
  base.extend({ estado: z.literal("DATOS_INSUFICIENTES"), consumo: z.null(), motivo: MotivoConsumoSchema }),
  base.extend({ estado: z.literal("NO_COMPARABLE"), consumo: z.null(), motivo: MotivoConsumoSchema }),
  base.extend({ estado: z.literal("NO_APLICA"), consumo: z.null(), motivo: MotivoConsumoSchema }),
]);
export type ConsumoResponse = z.infer<typeof ConsumoResponseSchema>;
export const BalanceQuerySchema = z.object({
  instalacionId: z.string().uuid(), fechaInicio: z.coerce.date(), fechaFin: z.coerce.date(),
}).strict();
export type BalanceQuery = z.infer<typeof BalanceQuerySchema>;
export type ConsumosErrorCode = "RANGO_FECHAS_INVALIDO" | "INSTALACION_NO_ASIGNADA" | "MEDIDOR_NOT_FOUND" | "INSTALACION_NOT_FOUND";
export class ConsumoError extends DomainError {
  constructor(readonly code: ConsumosErrorCode, readonly statusCode: number, message: string) { super(message); }
}
export const MotivoBalanceSchema = z.enum([
  "PERIODOS_NO_ALINEADOS", "VINCULO_CAMBIO_EN_PERIODO", "DATOS_INSUFICIENTES",
  "HIJOS_SUPERAN_PADRE", "JERARQUIA_INCOHERENTE",
]);
export const BalanceNodoSchema = z.object({
  medidorId: z.string().uuid(), medidorCodigo: z.string(), medidorPadreId: z.string().uuid().nullable(),
  profundidad: z.number().int().nonnegative(), recurso: z.string(), unidad: z.string(),
  consumoPropio: ConsumoResponseSchema, hijosDirectos: z.array(z.string().uuid()),
  consumoDistribuido: z.number().nullable(), saldoSinDistribuir: z.number().nullable(),
  estado: z.enum(["CALCULADO", "NO_COMPARABLE", "DATOS_INSUFICIENTES", "ADVERTENCIA"]),
  motivos: z.array(MotivoBalanceSchema), participaEnTotal: z.boolean(),
});
export type BalanceNodo = z.infer<typeof BalanceNodoSchema>;
export const BalanceResponseSchema = z.object({
  instalacionId: z.string().uuid(), fechaInicio: z.date(), fechaFin: z.date(), nodos: z.array(BalanceNodoSchema),
  totales: z.array(z.object({ recurso: z.string(), unidad: z.string(), consumo: z.number().nullable(),
    estado: z.enum(["CALCULADO", "NO_COMPARABLE", "DATOS_INSUFICIENTES"]),
    cobertura: z.enum(["COMPLETA", "PARCIAL", "INSUFICIENTE"]),
    fechaInicialReal: z.date().nullable(), fechaFinalReal: z.date().nullable(),
  })),
});
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;
