import { z } from "zod";
import { DomainError } from "../../core/errors.js";
export {
  InstalacionNotFoundError,
  InstalacionInactivaError,
  PeriodoGraciaExpiradoError,
  EliminacionFisicaProhibidaError,
} from "../instalaciones/instalaciones.schema.js";

// ==============================================================================
// Enums para Tipos de Medidor
// ==============================================================================

export const RecursoMedidorEnum = z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]);
export type RecursoMedidor = z.infer<typeof RecursoMedidorEnum>;

export const UnidadMedidaEnum = z.enum(["LITROS", "M3", "KWH", "PORCENTAJE", "OTRO"]);
export type UnidadMedida = z.infer<typeof UnidadMedidaEnum>;

export const TipoMedicionEnum = z.enum(["ACUMULATIVO", "INSTANTANEO", "NIVEL"]);
export type TipoMedicion = z.infer<typeof TipoMedicionEnum>;

// ==============================================================================
// DTOs para Tipos de Medidor
// ==============================================================================

export const CrearTipoMedidorInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no puede exceder 100 caracteres"),
  recurso: RecursoMedidorEnum,
  unidad: UnidadMedidaEnum.optional(),
  unidadMedida: UnidadMedidaEnum.optional(),
  tipoMedicion: TipoMedicionEnum,
  multiplicador: z
    .number()
    .positive("El multiplicador debe ser mayor a 0")
    .max(1000000, "El multiplicador no puede exceder 1.000.000")
    .default(1),
  capacidadMaxima: z
    .number()
    .positive("La capacidad máxima debe ser mayor a 0")
    .max(100000000, "La capacidad máxima no puede exceder 100.000.000")
    .nullable()
    .optional(),
});

export type CrearTipoMedidorInput = z.input<typeof CrearTipoMedidorInputSchema>;

export const EditarTipoMedidorInputSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(3, "El nombre debe tener al menos 3 caracteres")
      .max(100, "El nombre no puede exceder 100 caracteres")
      .optional(),
    recurso: RecursoMedidorEnum.optional(),
    unidad: UnidadMedidaEnum.optional(),
    unidadMedida: UnidadMedidaEnum.optional(),
    tipoMedicion: TipoMedicionEnum.optional(),
    multiplicador: z
      .number()
      .positive("El multiplicador debe ser mayor a 0")
      .max(1000000, "El multiplicador no puede exceder 1.000.000")
      .optional(),
    capacidadMaxima: z
      .number()
      .positive("La capacidad máxima debe ser mayor a 0")
      .max(100000000, "La capacidad máxima no puede exceder 100.000.000")
      .nullable()
      .optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Debe indicar al menos un campo a modificar",
  });

export type EditarTipoMedidorInput = z.infer<typeof EditarTipoMedidorInputSchema>;

export const TipoMedidorResponseSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  recurso: RecursoMedidorEnum,
  unidad: UnidadMedidaEnum,
  unidadMedida: z.string().optional(),
  tipoMedicion: TipoMedicionEnum,
  multiplicador: z.number().positive().default(1),
  capacidadMaxima: z.number().positive().nullable().optional(),
  activo: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TipoMedidorResponse = z.infer<typeof TipoMedidorResponseSchema>;

// ==============================================================================
// DTOs para Medidores Físicos
// ==============================================================================

export const CrearMedidorInputSchema = z.object({
  medidorPadreId: z.string().uuid().nullable().optional(),
  instalacionId: z.string().uuid("Identificador de instalación inválido"),
  tipoMedidorId: z.string().uuid("Identificador de tipo de medidor inválido"),
  codigo: z
    .string()
    .trim()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(50, "El código no puede exceder 50 caracteres"),
  codigoExterno: z
    .string()
    .trim()
    .min(3, "El código externo debe tener al menos 3 caracteres")
    .max(100, "El código externo no puede exceder 100 caracteres")
    .nullable()
    .optional(),
  factorInstalacion: z
    .number()
    .positive("El factor de instalación debe ser mayor a 0")
    .max(1000000, "El factor de instalación no puede exceder 1.000.000")
    .nullable()
    .optional(),
  numeroSerie: z.string().trim().max(100).optional(),
  ubicacionInterna: z
    .string()
    .trim()
    .min(2, "La ubicación interna debe tener al menos 2 caracteres")
    .max(200),
});

export type CrearMedidorInput = z.infer<typeof CrearMedidorInputSchema>;

export const EditarMedidorInputSchema = z.object({
  tipoMedidorId: z.string().uuid("Identificador de tipo de medidor inválido").optional(),
  codigo: z
    .string()
    .trim()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(50, "El código no puede exceder 50 caracteres")
    .optional(),
  codigoExterno: z
    .string()
    .trim()
    .min(3, "El código externo debe tener al menos 3 caracteres")
    .max(100, "El código externo no puede exceder 100 caracteres")
    .nullable()
    .optional(),
  factorInstalacion: z
    .number()
    .positive("El factor de instalación debe ser mayor a 0")
    .max(1000000, "El factor de instalación no puede exceder 1.000.000")
    .nullable()
    .optional(),
  numeroSerie: z.string().trim().max(100).nullable().optional(),
  ubicacionInterna: z
    .string()
    .trim()
    .min(2, "La ubicación interna debe tener al menos 2 caracteres")
    .max(200)
    .optional(),
  activo: z.boolean().optional(),
});

export type EditarMedidorInput = z.infer<typeof EditarMedidorInputSchema>;

export const CambiarPadreInputSchema = z.object({ medidorPadreId: z.string().uuid().nullable() }).strict();
export type CambiarPadreInput = z.infer<typeof CambiarPadreInputSchema>;

export const MedidorResponseSchema = z.object({
  medidorPadreId: z.string().uuid().nullable().optional(),
  medidorPadre: z.object({ id: z.string().uuid(), codigo: z.string() }).nullable().optional(),
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  tipoMedidorId: z.string().uuid(),
  codigo: z.string(),
  codigoExterno: z.string().nullable().optional(),
  factorInstalacion: z.number().nullable().optional(),
  numeroSerie: z.string().nullable().optional(),
  ubicacionInterna: z.string(),
  activo: z.boolean(),
  enPeriodoGracia: z.boolean().optional(),
  diasRestantesGracia: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tipoMedidor: TipoMedidorResponseSchema.optional(),
  ultimaLectura: z
    .object({
      valor: z.number(),
      timestamp: z.date(),
      fechaLectura: z.date().optional(),
      fecha: z.date().optional(),
    })
    .nullable()
    .optional(),
});

export type MedidorResponse = z.infer<typeof MedidorResponseSchema>;

// ==============================================================================
// Errores de Dominio Tipados
// ==============================================================================

export type MedidoresErrorCode =
  | "TIPO_MEDIDOR_NOT_FOUND"
  | "TIPO_MEDIDOR_NOMBRE_DUPLICADO"
  | "TIPO_MEDIDOR_INACTIVO"
  | "TIPO_MEDIDOR_EN_USO"
  | "TIPO_MEDIDOR_CON_MEDIDORES_NO_ELIMINABLE"
  | "MEDIDOR_NOT_FOUND"
  | "MEDIDOR_CODIGO_DUPLICADO"
  | "MEDIDOR_CODIGO_EXTERNO_DUPLICADO"
  | "PERIODO_GRACIA_EXPIRADO"
  | "ELIMINACION_FISICA_PROHIBIDA"
  | "MEDIDOR_CON_LECTURAS_NO_ELIMINABLE";

export class TipoMedidorNotFoundError extends DomainError {
  readonly code = "TIPO_MEDIDOR_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Tipo de medidor con ID '${id}' no encontrado.`, { id });
  }
}

export class TipoMedidorNombreDuplicadoError extends DomainError {
  readonly code = "TIPO_MEDIDOR_NOMBRE_DUPLICADO";
  readonly statusCode = 409;
  constructor(nombre: string) {
    super(`Ya existe un tipo de medidor con el nombre '${nombre}'.`, { nombre });
  }
}

export class TipoMedidorInactivoError extends DomainError {
  readonly code = "TIPO_MEDIDOR_INACTIVO";
  readonly statusCode = 422;
  constructor(id: string) {
    super(`El tipo de medidor '${id}' se encuentra inactivo.`, { id });
  }
}

export class TipoMedidorEnUsoError extends DomainError {
  readonly code = "TIPO_MEDIDOR_EN_USO";
  readonly statusCode = 409;
  constructor(nombre: string, count: number, operacion: string) {
    super(
      `No se puede ${operacion} el tipo '${nombre}' porque tiene ${count} medidor(es) asociado(s). Reasigne los medidores a otro tipo primero.`,
      { nombre, count, operacion }
    );
  }
}

export class TipoMedidorConMedidoresNoEliminableError extends DomainError {
  readonly code = "TIPO_MEDIDOR_CON_MEDIDORES_NO_ELIMINABLE";
  readonly statusCode = 422;
  constructor(id: string, count: number) {
    super(
      `No se puede eliminar el tipo de medidor '${id}' porque tiene ${count} medidor(es) asociado(s). Reasigne los medidores a otro tipo primero.`,
      { id, count }
    );
  }
}

export class MedidorNotFoundError extends DomainError {
  readonly code = "MEDIDOR_NOT_FOUND";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Medidor con ID '${id}' no encontrado.`, { id });
  }
}

export class MedidorCodigoDuplicadoError extends DomainError {
  readonly code = "MEDIDOR_CODIGO_DUPLICADO";
  readonly statusCode = 409;
  constructor(codigo: string) {
    super(`Ya existe un medidor con el código '${codigo}'.`, { codigo });
  }
}

export class MedidorCodigoExternoDuplicadoError extends DomainError {
  readonly code = "MEDIDOR_CODIGO_EXTERNO_DUPLICADO";
  readonly statusCode = 409;
  constructor(codigoExterno: string) {
    super(`Ya existe un medidor con el código externo '${codigoExterno}'.`, { codigoExterno });
  }
}

export class MedidorConLecturasNoEliminableError extends DomainError {
  readonly code = "MEDIDOR_CON_LECTURAS_NO_ELIMINABLE";
  readonly statusCode = 422;
  constructor(id: string, count: number) {
    super(
      `No se puede eliminar el medidor '${id}' porque tiene ${count} lectura(s) registradas. Debe archivarse.`,
      { id, count }
    );
  }
}

export type JerarquiaErrorCode = "INSTALACION_NO_ASIGNADA" | "MEDIDOR_PADRE_NOT_FOUND" | "MEDIDOR_JERARQUIA_CICLICA"
  | "MEDIDOR_PADRE_INCOMPATIBLE" | "MEDIDOR_CON_REMARCADORES_ACTIVOS"
  | "MEDIDOR_CON_VINCULOS_NO_ELIMINABLE" | "TIPO_MEDIDOR_CON_HISTORIAL_INCOMPATIBLE"
  | "MEDIDOR_VINCULO_CONFLICTO";
export class JerarquiaError extends DomainError {
  constructor(readonly code: JerarquiaErrorCode, message: string, readonly statusCode: number = 422) { super(message); }
}
