import { z } from "zod";
import { DomainError } from "../../core/errors.js";

export const TipoAccionAuditoriaEnum = z.enum([
  "MEDIDOR_PADRE_ASIGNADO",
  "MEDIDOR_PADRE_CAMBIADO",
  "MEDIDOR_PADRE_DESVINCULADO",
  "CAMBIO_ROL",
  "RESET_PASSWORD_ADMIN",
  "BAJA_MEDIDOR",
  "CAMBIO_PRECINTO",
  "LOGIN_FALLIDO",
  "BACKUP_SISTEMA",
  "INSTALACION_EDITADA",
  "INSTALACION_ARCHIVADA",
  "INSTALACION_RESTAURADA",
  "INSTALACION_ELIMINADA_GRACIA",
  "MEDIDOR_EDITADO",
  "MEDIDOR_ARCHIVADO",
  "MEDIDOR_RESTAURADO",
  "MEDIDOR_ELIMINADO_GRACIA",
  "TIPO_MEDIDOR_EDITADO",
  "TIPO_MEDIDOR_ARCHIVADO",
  "TIPO_MEDIDOR_RESTAURADO",
  "TIPO_MEDIDOR_ELIMINADO",
]);

export type TipoAccionAuditoria = z.infer<typeof TipoAccionAuditoriaEnum>;

export const RegistrarAuditoriaInputSchema = z.object({
  usuarioId: z.string().uuid().optional().nullable(),
  accion: TipoAccionAuditoriaEnum,
  entidad: z.string().trim().min(2).max(50),
  entidadId: z.string().trim().min(1),
  detalles: z.record(z.unknown()).optional().nullable(),
  ip: z.string().trim().optional().nullable(),
});

export type RegistrarAuditoriaInput = z.infer<typeof RegistrarAuditoriaInputSchema>;

export const FiltroAuditoriaSchema = z.object({
  accion: z.string().optional(),
  entidad: z.string().optional(),
  entidadId: z.string().optional(),
  usuarioId: z.string().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type FiltroAuditoria = z.infer<typeof FiltroAuditoriaSchema>;

export const AuditoriaEventoResponseSchema = z.object({
  id: z.string().uuid(),
  usuarioId: z.string().nullable().optional(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: z.string(),
  detalles: z.record(z.unknown()).nullable().optional(),
  ip: z.string().nullable().optional(),
  createdAt: z.date(),
});

export type AuditoriaEventoResponse = z.infer<typeof AuditoriaEventoResponseSchema>;

export const HealthzResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number().nonnegative(),
  timestamp: z.string(),
});

export type HealthzResponse = z.infer<typeof HealthzResponseSchema>;

export const ReadyzResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  database: z.enum(["connected", "disconnected"]),
  timestamp: z.string(),
  error: z.string().optional(),
});

export type ReadyzResponse = z.infer<typeof ReadyzResponseSchema>;

// Errores de dominio tipados
export type AuditoriaErrorCode =
  | "AUDITORIA_EVENTO_INVALIDO"
  | "ACCESO_DENEGADO"
  | "DATABASE_NOT_READY";

export class DatabaseNotReadyError extends DomainError {
  readonly code = "DATABASE_NOT_READY";
  readonly statusCode = 503;

  constructor(motivo: string) {
    super(`Base de datos no disponible para atender solicitudes: ${motivo}`);
  }
}

export class AuditoriaInvalidaError extends DomainError {
  readonly code = "AUDITORIA_EVENTO_INVALIDO";
  readonly statusCode = 400;

  constructor(motivo: string) {
    super(`Evento de auditoría inválido: ${motivo}`);
  }
}
