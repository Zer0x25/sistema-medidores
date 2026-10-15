import {
  CambiarPadreInput, CambiarPadreInputSchema, JerarquiaError,
  CrearTipoMedidorInput,
  CrearTipoMedidorInputSchema,
  EditarTipoMedidorInput,
  EditarTipoMedidorInputSchema,
  TipoMedidorResponse,
  CrearMedidorInput,
  CrearMedidorInputSchema,
  EditarMedidorInput,
  EditarMedidorInputSchema,
  MedidorResponse,
  TipoMedidorNombreDuplicadoError,
  TipoMedidorNotFoundError,
  TipoMedidorInactivoError,
  TipoMedidorEnUsoError,
  TipoMedidorConMedidoresNoEliminableError,
  MedidorNotFoundError,
  MedidorCodigoDuplicadoError,
  MedidorCodigoExternoDuplicadoError,
  PeriodoGraciaExpiradoError,
  EliminacionFisicaProhibidaError,
  MedidorConLecturasNoEliminableError,
  RecursoMedidor,
  UnidadMedida,
  TipoMedicion,
} from "./medidores.schema.js";
import { TipoAccionAuditoria } from "../auditoria/auditoria.schema.js";
import { calcularPeriodoGracia } from "../instalaciones/instalaciones.service.js";

export interface TipoMedidorEntity {
  id: string;
  nombre: string;
  recurso: RecursoMedidor;
  unidad: UnidadMedida;
  unidadMedida?: string;
  tipoMedicion: TipoMedicion;
  multiplicador: number;
  capacidadMaxima?: number | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedidorEntity {
  medidorPadreId?: string | null;
  medidorPadre?: { id: string; codigo: string } | null;
  id: string;
  instalacionId: string;
  tipoMedidorId: string;
  codigo: string;
  codigoExterno?: string | null;
  factorInstalacion?: number | null;
  numeroSerie?: string | null;
  ubicacionInterna: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tipoMedidor?: TipoMedidorEntity;
  ultimaLectura?: {
    valor: number;
    timestamp: Date;
    fechaLectura?: Date;
    fecha?: Date;
  } | null;
}

export interface IMedidoresRepository {
  conTransaccion?<T>(operacion: (repo: IMedidoresRepository) => Promise<T>): Promise<T>;
  countHijosActivos?(id: string): Promise<number>;
  countVinculos?(id: string): Promise<number>;
  registrarVinculo?(id: string, padreId: string | null, context: { usuarioId: string; ip?: string }): Promise<void>;

  findTipoById(id: string): Promise<TipoMedidorEntity | null>;
  findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null>;
  createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity>;
  listTiposActivos(): Promise<TipoMedidorEntity[]>;
  listTipos(estado?: "activos" | "archivados" | "todos"): Promise<TipoMedidorEntity[]>;
  updateTipo(id: string, data: Partial<TipoMedidorEntity>): Promise<TipoMedidorEntity>;
  deleteTipoFisico(id: string): Promise<boolean>;
  countMedidoresByTipo(tipoId: string): Promise<number>;

  findMedidorById(id: string): Promise<MedidorEntity | null>;
  findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null>;
  findMedidorByCodigoExterno?(codigoExterno: string): Promise<MedidorEntity | null>;
  countLecturas?(medidorId: string): Promise<number>;
  createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity>;
  updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity>;
  deleteMedidorFisico?(id: string): Promise<boolean>;
  listMedidoresByInstalacion(instalacionId: string, estado?: "activos" | "archivados" | "todos"): Promise<MedidorEntity[]>;
  listMedidores(instalacionIds?: string[], estado?: "activos" | "archivados" | "todos"): Promise<MedidorEntity[]>;
}

export interface IInstalacionesVerificationService {
  verifyInstalacionActiva(id: string): Promise<void>;
}

export interface IMedidoresAuditoriaLogger {
  registrarEvento(input: {
    usuarioId?: string | null;
    accion: TipoAccionAuditoria;
    entidad: string;
    entidadId: string;
    detalles?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<unknown>;
}

export class MedidoresService {
  constructor(
    private readonly repository: IMedidoresRepository,
    private readonly instalacionesService: IInstalacionesVerificationService,
    private readonly auditoriaLogger?: IMedidoresAuditoriaLogger
  ) {}

  async crearTipoMedidor(rawInput: CrearTipoMedidorInput): Promise<TipoMedidorResponse> {
    const input = CrearTipoMedidorInputSchema.parse(rawInput);

    const existente = await this.repository.findTipoByNombre(input.nombre);
    if (existente) {
      throw new TipoMedidorNombreDuplicadoError(input.nombre);
    }

    const unidad = (input.unidad || input.unidadMedida) as UnidadMedida;
    if (!unidad) {
      throw new Error("Debe especificar la unidad de medida");
    }

    const tipo = await this.repository.createTipo({
      nombre: input.nombre.trim(),
      recurso: input.recurso,
      unidad,
      tipoMedicion: input.tipoMedicion,
      multiplicador: input.multiplicador ?? 1,
      capacidadMaxima: input.capacidadMaxima ?? null,
      activo: true,
    });

    return {
      ...tipo,
      multiplicador: tipo.multiplicador ?? 1,
      capacidadMaxima: tipo.capacidadMaxima ?? null,
      unidadMedida: tipo.unidad,
    };
  }

  async listarTiposMedidor(estado?: "activos" | "archivados" | "todos"): Promise<TipoMedidorResponse[]> {
    const list = await this.repository.listTipos(estado ?? "activos");
    return list.map((tipo) => ({
      ...tipo,
      multiplicador: tipo.multiplicador ?? 1,
      capacidadMaxima: tipo.capacidadMaxima ?? null,
      unidadMedida: tipo.unidad,
    }));
  }

  async obtenerTipoPorId(id: string): Promise<TipoMedidorResponse> {
    const tipo = await this.repository.findTipoById(id);
    if (!tipo) {
      throw new TipoMedidorNotFoundError(id);
    }
    return {
      ...tipo,
      multiplicador: tipo.multiplicador ?? 1,
      capacidadMaxima: tipo.capacidadMaxima ?? null,
      unidadMedida: tipo.unidad,
    };
  }

  async editarTipoMedidor(
    id: string,
    rawInput: EditarTipoMedidorInput,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<TipoMedidorResponse> {
    const input = EditarTipoMedidorInputSchema.parse(rawInput);
    const actual = await this.repository.findTipoById(id);
    if (!actual) {
      throw new TipoMedidorNotFoundError(id);
    }
    const enUso = await this.repository.countMedidoresByTipo(id);
    if (enUso > 0) {
      throw new TipoMedidorEnUsoError(actual.nombre, enUso, "editar");
    }
    if (input.nombre !== undefined && input.nombre.trim().toLowerCase() !== actual.nombre.trim().toLowerCase()) {
      const dup = await this.repository.findTipoByNombre(input.nombre);
      if (dup && dup.id !== id) {
        throw new TipoMedidorNombreDuplicadoError(input.nombre);
      }
    }
    const unidad = (input.unidad ?? input.unidadMedida ?? undefined) as UnidadMedida | undefined;
    const updated = await this.repository.updateTipo(id, {
      ...(input.nombre !== undefined && { nombre: input.nombre.trim() }),
      ...(input.recurso !== undefined && { recurso: input.recurso }),
      ...(unidad !== undefined && { unidad }),
      ...(input.tipoMedicion !== undefined && { tipoMedicion: input.tipoMedicion }),
      ...(input.multiplicador !== undefined && { multiplicador: input.multiplicador }),
      ...(input.capacidadMaxima !== undefined && { capacidadMaxima: input.capacidadMaxima }),
      ...(input.activo !== undefined && { activo: input.activo }),
    });
    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "TIPO_MEDIDOR_EDITADO",
        entidad: "TipoMedidor",
        entidadId: id,
        detalles: { antes: { nombre: actual.nombre }, despues: { nombre: updated.nombre } },
        ip: context?.ip,
      });
    }
    return {
      ...updated,
      multiplicador: updated.multiplicador ?? 1,
      capacidadMaxima: updated.capacidadMaxima ?? null,
      unidadMedida: updated.unidad,
    };
  }

  async archivarTipo(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<TipoMedidorResponse> {
    const actual = await this.repository.findTipoById(id);
    if (!actual) {
      throw new TipoMedidorNotFoundError(id);
    }
    const enUso = await this.repository.countMedidoresByTipo(id);
    if (enUso > 0) {
      throw new TipoMedidorEnUsoError(actual.nombre, enUso, "archivar");
    }
    const updated = await this.repository.updateTipo(id, { activo: false });
    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "TIPO_MEDIDOR_ARCHIVADO",
        entidad: "TipoMedidor",
        entidadId: id,
        detalles: { nombre: actual.nombre },
        ip: context?.ip,
      });
    }
    return {
      ...updated,
      multiplicador: updated.multiplicador ?? 1,
      capacidadMaxima: updated.capacidadMaxima ?? null,
      unidadMedida: updated.unidad,
    };
  }

  async restaurarTipo(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<TipoMedidorResponse> {
    const actual = await this.repository.findTipoById(id);
    if (!actual) {
      throw new TipoMedidorNotFoundError(id);
    }
    const updated = await this.repository.updateTipo(id, { activo: true });
    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "TIPO_MEDIDOR_RESTAURADO",
        entidad: "TipoMedidor",
        entidadId: id,
        detalles: { nombre: actual.nombre },
        ip: context?.ip,
      });
    }
    return {
      ...updated,
      multiplicador: updated.multiplicador ?? 1,
      capacidadMaxima: updated.capacidadMaxima ?? null,
      unidadMedida: updated.unidad,
    };
  }

  async eliminarTipoFisico(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<boolean> {
    const actual = await this.repository.findTipoById(id);
    if (!actual) {
      throw new TipoMedidorNotFoundError(id);
    }
    const enUso = await this.repository.countMedidoresByTipo(id);
    if (enUso > 0) {
      throw new TipoMedidorConMedidoresNoEliminableError(id, enUso);
    }
    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "TIPO_MEDIDOR_ELIMINADO",
        entidad: "TipoMedidor",
        entidadId: id,
        detalles: { snapshot: { id: actual.id, nombre: actual.nombre } },
        ip: context?.ip,
      });
    }
    return await this.repository.deleteTipoFisico(id);
  }

  async crearMedidor(rawInput: CrearMedidorInput, context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }, enTransaccion = false): Promise<MedidorResponse> {
    const input = CrearMedidorInputSchema.parse(rawInput);
    if (input.medidorPadreId && !enTransaccion) {
      if (!this.repository.conTransaccion) throw new JerarquiaError("MEDIDOR_VINCULO_CONFLICTO", "Persistencia transaccional no disponible.", 409);
      return this.repository.conTransaccion(repo => new MedidoresService(repo, this.instalacionesService).crearMedidor(input, context, true));
    }

    // 1. Verificar existencia y estado activo de la instalación
    await this.instalacionesService.verifyInstalacionActiva(input.instalacionId);

    // 2. Verificar existencia y estado activo del tipo de medidor
    const tipo = await this.repository.findTipoById(input.tipoMedidorId);
    if (!tipo) {
      throw new TipoMedidorNotFoundError(input.tipoMedidorId);
    }
    if (!tipo.activo) {
      throw new TipoMedidorInactivoError(input.tipoMedidorId);
    }

    // 3. Verificar unicidad de código
    const existente = await this.repository.findMedidorByCodigo(input.codigo);
    if (existente) {
      throw new MedidorCodigoDuplicadoError(input.codigo);
    }

    // 3b. Verificar unicidad de código externo (solo si se provee)
    const codigoExterno = input.codigoExterno?.trim() || null;
    if (codigoExterno && this.repository.findMedidorByCodigoExterno) {
      const existenteExt = await this.repository.findMedidorByCodigoExterno(codigoExterno);
      if (existenteExt) {
        throw new MedidorCodigoExternoDuplicadoError(codigoExterno);
      }
    }

    // 4. Crear el medidor
    const creado = await this.repository.createMedidor({
      instalacionId: input.instalacionId,
      tipoMedidorId: input.tipoMedidorId,
      codigo: input.codigo.trim(),
      codigoExterno,
      factorInstalacion: input.factorInstalacion ?? null,
      numeroSerie: input.numeroSerie ? input.numeroSerie.trim() : null,
      ubicacionInterna: input.ubicacionInterna.trim(),
      activo: true,
    });

    if (input.medidorPadreId) {
      await this.cambiarPadreInterno(creado.id, input.medidorPadreId, context);
      return this.obtenerMedidorPorId(creado.id);
    }
    return this.mapResponse({
      ...creado,
      tipoMedidor: {
        ...tipo,
        unidadMedida: tipo.unidad,
      },
    });
  }

  async cambiarPadre(id: string, raw: CambiarPadreInput, context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }): Promise<MedidorResponse> {
    const input = CambiarPadreInputSchema.parse(raw);
    if (!this.repository.conTransaccion) throw new JerarquiaError("MEDIDOR_VINCULO_CONFLICTO", "Persistencia transaccional no disponible.", 409);
    return this.repository.conTransaccion(async repo => {
      const servicio = new MedidoresService(repo, this.instalacionesService);
      await servicio.cambiarPadreInterno(id, input.medidorPadreId, context);
      return servicio.obtenerMedidorPorId(id);
    });
  }

  private async cambiarPadreInterno(id: string, padreId: string | null, context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }): Promise<void> {
    const hijo = await this.repository.findMedidorById(id);
    if (!hijo) throw new MedidorNotFoundError(id);
    if ((hijo.medidorPadreId ?? null) === padreId) return;
    if (padreId) {
      const padre = await this.repository.findMedidorById(padreId);
      if (!padre) throw new JerarquiaError("MEDIDOR_PADRE_NOT_FOUND", "Medidor padre no encontrado.", 404);
      if (context?.allowedInstalacionIds !== undefined && !context.allowedInstalacionIds.includes(padre.instalacionId)) {
        throw new JerarquiaError("INSTALACION_NO_ASIGNADA", "El padre pertenece a una instalación no asignada.", 403);
      }
      const visitados = new Set([id]);
      let actual: MedidorEntity | null = padre;
      while (actual) {
        if (visitados.has(actual.id)) throw new JerarquiaError("MEDIDOR_JERARQUIA_CICLICA", "El padre no puede ser el propio equipo ni uno de sus descendientes.");
        visitados.add(actual.id);
        actual = actual.medidorPadreId ? await this.repository.findMedidorById(actual.medidorPadreId) : null;
      }
      if (!hijo.activo || !padre.activo || hijo.instalacionId !== padre.instalacionId
        || hijo.tipoMedidor?.tipoMedicion !== "ACUMULATIVO" || padre.tipoMedidor?.tipoMedicion !== "ACUMULATIVO"
        || hijo.tipoMedidor.recurso !== padre.tipoMedidor.recurso || hijo.tipoMedidor.unidad !== padre.tipoMedidor.unidad) {
        throw new JerarquiaError("MEDIDOR_PADRE_INCOMPATIBLE", "Padre e hijo deben estar activos y compartir sede, recurso, unidad y modo acumulativo.");
      }
    }
    if (!context?.usuarioId || !this.repository.registrarVinculo) throw new JerarquiaError("MEDIDOR_VINCULO_CONFLICTO", "Se requiere un actor autenticado y una transacción para vincular.", 409);
    await this.repository.registrarVinculo(id, padreId, { usuarioId: context.usuarioId, ip: context.ip });
  }

  private mapResponse(m: MedidorEntity): MedidorResponse {
    const { enPeriodoGracia, diasRestantesGracia } = calcularPeriodoGracia(m.createdAt);
    const tipo = m.tipoMedidor
      ? {
          ...m.tipoMedidor,
          multiplicador: (m.tipoMedidor as { multiplicador?: number }).multiplicador ?? 1,
          capacidadMaxima: (m.tipoMedidor as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
          unidadMedida: m.tipoMedidor.unidad,
        }
      : undefined;
    return {
      ...m,
      medidorPadreId: m.medidorPadreId ?? null,
      medidorPadre: m.medidorPadre ?? null,
      enPeriodoGracia,
      diasRestantesGracia,
      tipoMedidor: tipo as MedidorResponse["tipoMedidor"],
      ultimaLectura: m.ultimaLectura
        ? {
            ...m.ultimaLectura,
            fechaLectura: m.ultimaLectura.timestamp,
            fecha: m.ultimaLectura.timestamp,
          }
        : null,
    };
  }

  async obtenerMedidorPorId(id: string): Promise<MedidorResponse> {
    const medidor = await this.repository.findMedidorById(id);
    if (!medidor) {
      throw new MedidorNotFoundError(id);
    }

    if (!medidor.tipoMedidor) {
      const tipo = await this.repository.findTipoById(medidor.tipoMedidorId);
      if (tipo) {
        medidor.tipoMedidor = {
          ...tipo,
          unidadMedida: tipo.unidad,
        };
      }
    } else {
      medidor.tipoMedidor = {
        ...medidor.tipoMedidor,
        unidadMedida: medidor.tipoMedidor.unidad,
      };
    }

    return this.mapResponse(medidor);
  }

  async editarMedidor(
    id: string,
    rawInput: EditarMedidorInput,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<MedidorResponse> {
    const input = EditarMedidorInputSchema.parse(rawInput);
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);

    if (input.codigo !== undefined && input.codigo !== actual.codigo) {
      if (!enPeriodoGracia) {
        throw new PeriodoGraciaExpiradoError("medidor", id);
      }
      const dup = await this.repository.findMedidorByCodigo(input.codigo);
      if (dup && dup.id !== id) {
        throw new MedidorCodigoDuplicadoError(input.codigo);
      }
    }

    if (input.codigoExterno !== undefined && input.codigoExterno !== null) {
      const extTrim = input.codigoExterno.trim();
      const actualExt = (actual.codigoExterno ?? null) as string | null;
      if (extTrim !== (actualExt ?? "")) {
        if (this.repository.findMedidorByCodigoExterno) {
          const dupExt = await this.repository.findMedidorByCodigoExterno(extTrim);
          if (dupExt && dupExt.id !== id) {
            throw new MedidorCodigoExternoDuplicadoError(extTrim);
          }
        }
      }
    }

    if (input.tipoMedidorId !== undefined && input.tipoMedidorId !== actual.tipoMedidorId) {
      const nuevoTipo = await this.repository.findTipoById(input.tipoMedidorId);
      if (!nuevoTipo) {
        throw new TipoMedidorNotFoundError(input.tipoMedidorId);
      }
      if (!nuevoTipo.activo) {
        throw new TipoMedidorInactivoError(input.tipoMedidorId);
      }
    }

    if (input.activo === false && await this.repository.countHijosActivos?.(id)) throw new JerarquiaError("MEDIDOR_CON_REMARCADORES_ACTIVOS", "Archive o desvincule los remarcadores activos primero.");
    const updated = await this.repository.updateMedidor(id, {
      ...(input.tipoMedidorId !== undefined && { tipoMedidorId: input.tipoMedidorId }),
      ...(input.codigo !== undefined && { codigo: input.codigo.trim() }),
      ...(input.codigoExterno !== undefined && {
        codigoExterno: input.codigoExterno === null ? null : input.codigoExterno.trim(),
      }),
      ...(input.factorInstalacion !== undefined && { factorInstalacion: input.factorInstalacion }),
      ...(input.numeroSerie !== undefined && { numeroSerie: input.numeroSerie }),
      ...(input.ubicacionInterna !== undefined && { ubicacionInterna: input.ubicacionInterna.trim() }),
      ...(input.activo !== undefined && { activo: input.activo }),
    });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_EDITADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: {
          antes: { codigo: actual.codigo, tipoMedidorId: actual.tipoMedidorId, codigoExterno: (actual.codigoExterno ?? null) as unknown, factorInstalacion: (actual.factorInstalacion ?? null) as unknown, ubicacion: actual.ubicacionInterna, serie: actual.numeroSerie },
          despues: { codigo: updated.codigo, tipoMedidorId: updated.tipoMedidorId, codigoExterno: ((updated as unknown as { codigoExterno?: string | null }).codigoExterno ?? null), factorInstalacion: ((updated as unknown as { factorInstalacion?: number | null }).factorInstalacion ?? null), ubicacion: updated.ubicacionInterna, serie: updated.numeroSerie },
        },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: updated.tipoMedidor ?? actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async archivarMedidor(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<MedidorResponse> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    if (await this.repository.countHijosActivos?.(id)) throw new JerarquiaError("MEDIDOR_CON_REMARCADORES_ACTIVOS", "Archive o desvincule los remarcadores activos primero.");
    const updated = await this.repository.updateMedidor(id, { activo: false });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_ARCHIVADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: { codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: updated.tipoMedidor ?? actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async restaurarMedidor(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<MedidorResponse> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    if (actual.medidorPadreId) {
      const padre = await this.repository.findMedidorById(actual.medidorPadreId);
      if (!padre?.activo) throw new JerarquiaError("MEDIDOR_PADRE_INCOMPATIBLE", "El padre debe estar activo para restaurar el remarcador.");
    }
    const updated = await this.repository.updateMedidor(id, { activo: true });

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_RESTAURADO",
        entidad: "Medidor",
        entidadId: id,
        detalles: { codigo: actual.codigo },
        ip: context?.ip,
      });
    }

    return this.mapResponse({
      ...updated,
      tipoMedidor: updated.tipoMedidor ?? actual.tipoMedidor,
      ultimaLectura: actual.ultimaLectura,
    });
  }

  async desactivarMedidor(id: string): Promise<MedidorResponse> {
    return this.archivarMedidor(id);
  }

  async eliminarMedidorFisico(
    id: string,
    context?: { usuarioId?: string; ip?: string; allowedInstalacionIds?: string[] }
  ): Promise<boolean> {
    const actual = await this.repository.findMedidorById(id);
    if (!actual) {
      throw new MedidorNotFoundError(id);
    }

    const { enPeriodoGracia } = calcularPeriodoGracia(actual.createdAt);
    if (!enPeriodoGracia) {
      throw new EliminacionFisicaProhibidaError("medidor", id);
    }

    if (await this.repository.countVinculos?.(id)) throw new JerarquiaError("MEDIDOR_CON_VINCULOS_NO_ELIMINABLE", "El equipo tiene vínculos históricos y debe conservarse.");
    if (this.repository.countLecturas) {
      const lecturasCount = await this.repository.countLecturas(id);
      if (lecturasCount > 0) {
        throw new MedidorConLecturasNoEliminableError(id, lecturasCount);
      }
    }

    if (this.auditoriaLogger) {
      await this.auditoriaLogger.registrarEvento({
        usuarioId: context?.usuarioId,
        accion: "MEDIDOR_ELIMINADO_GRACIA",
        entidad: "Medidor",
        entidadId: id,
        detalles: {
          snapshot: {
            id: actual.id,
            codigo: actual.codigo,
            codigoExterno: (actual.codigoExterno ?? null) as unknown,
            factorInstalacion: (actual.factorInstalacion ?? null) as unknown,
            numeroSerie: actual.numeroSerie,
            ubicacionInterna: actual.ubicacionInterna,
            instalacionId: actual.instalacionId,
            createdAt: actual.createdAt,
          },
        },
        ip: context?.ip,
      });
    }

    if (this.repository.deleteMedidorFisico) {
      return await this.repository.deleteMedidorFisico(id);
    }
    return true;
  }

  async listarMedidoresPorInstalacion(
    instalacionId: string,
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorResponse[]> {
    const list = await this.repository.listMedidoresByInstalacion(instalacionId, estado);
    return list.map((m) => this.mapResponse(m));
  }

  async listarMedidores(
    instalacionIds?: string[],
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorResponse[]> {
    const list = await this.repository.listMedidores(instalacionIds, estado);
    return list.map((m) => this.mapResponse(m));
  }
}
