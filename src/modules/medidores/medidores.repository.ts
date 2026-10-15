import { Prisma, PrismaClient } from "@prisma/client";
import {
  IMedidoresRepository,
  TipoMedidorEntity,
  MedidorEntity,
} from "./medidores.service.js";
import { RecursoMedidor, UnidadMedida, TipoMedicion, JerarquiaError } from "./medidores.schema.js";

export class PrismaMedidoresRepository implements IMedidoresRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async conTransaccion<T>(operacion: (repo: IMedidoresRepository) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.prisma)) return operacion(this);
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`UPDATE medidores SET updatedAt = updatedAt WHERE 0`;
        return operacion(new PrismaMedidoresRepository(tx));
      }, { timeout: 15000, maxWait: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2028", "P2034", "P2002"].includes(error.code)) {
        throw new JerarquiaError("MEDIDOR_VINCULO_CONFLICTO", "La relación cambió concurrentemente; vuelva a consultar e intente de nuevo.", 409);
      }
      throw error;
    }
  }
  async countHijosActivos(id: string): Promise<number> { return this.prisma.medidor.count({ where: { medidorPadreId: id, activo: true } }); }
  async countVinculos(id: string): Promise<number> { return this.prisma.medidorVinculo.count({ where: { OR: [{ medidorId: id }, { medidorPadreId: id }] } }); }
  async registrarVinculo(id: string, padreId: string | null, context: { usuarioId: string; ip?: string }): Promise<void> {
    const anterior = await this.prisma.medidor.findUniqueOrThrow({ where: { id } });
    const vigenteDesde = new Date();
    await this.prisma.medidor.update({ where: { id }, data: { medidorPadreId: padreId } });
    await this.prisma.medidorVinculo.create({ data: { medidorId: id, medidorPadreId: padreId, vigenteDesde, usuarioId: context.usuarioId } });
    await this.prisma.auditoriaEvento.create({ data: {
      usuarioId: context.usuarioId, ip: context.ip, entidad: "Medidor", entidadId: id,
      accion: padreId === null ? "MEDIDOR_PADRE_DESVINCULADO" : anterior.medidorPadreId ? "MEDIDOR_PADRE_CAMBIADO" : "MEDIDOR_PADRE_ASIGNADO",
      detalles: JSON.stringify({ padreAnterior: anterior.medidorPadreId, padreNuevo: padreId, vigenteDesde }),
    } });
  }

  async findTipoById(id: string): Promise<TipoMedidorEntity | null> {
    const tipo = await this.prisma.tipoMedidor.findUnique({ where: { id } });
    if (!tipo) return null;
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async findTipoByNombre(nombre: string): Promise<TipoMedidorEntity | null> {
    const tipo = await this.prisma.tipoMedidor.findUnique({ where: { nombre } });
    if (!tipo) return null;
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async createTipo(
    data: Omit<TipoMedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<TipoMedidorEntity> {
    const tipo = await this.prisma.tipoMedidor.create({
      data: {
        nombre: data.nombre,
        recurso: data.recurso,
        unidad: data.unidad,
        tipoMedicion: data.tipoMedicion,
        multiplicador: data.multiplicador ?? 1,
        capacidadMaxima: data.capacidadMaxima ?? null,
        activo: data.activo,
      },
    });
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async listTiposActivos(): Promise<TipoMedidorEntity[]> {
    return this.listTipos("activos");
  }

  async listTipos(estado: "activos" | "archivados" | "todos" = "activos"): Promise<TipoMedidorEntity[]> {
    const where = estado === "activos" ? { activo: true } : estado === "archivados" ? { activo: false } : {};
    const list = await this.prisma.tipoMedidor.findMany({ where });
    return list.map((tipo) => ({
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    }));
  }

  async updateTipo(id: string, data: Partial<TipoMedidorEntity>): Promise<TipoMedidorEntity> {
    const tipo = await this.prisma.tipoMedidor.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre }),
        ...(data.recurso !== undefined && { recurso: data.recurso }),
        ...(data.unidad !== undefined && { unidad: data.unidad }),
        ...(data.tipoMedicion !== undefined && { tipoMedicion: data.tipoMedicion }),
        ...(data.multiplicador !== undefined && { multiplicador: data.multiplicador }),
        ...(data.capacidadMaxima !== undefined && { capacidadMaxima: data.capacidadMaxima }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });
    return {
      ...tipo,
      recurso: tipo.recurso as RecursoMedidor,
      unidad: tipo.unidad as UnidadMedida,
      unidadMedida: tipo.unidad,
      tipoMedicion: tipo.tipoMedicion as TipoMedicion,
      multiplicador: (tipo as unknown as { multiplicador?: number }).multiplicador ?? 1,
      capacidadMaxima: (tipo as unknown as { capacidadMaxima?: number | null }).capacidadMaxima ?? null,
    };
  }

  async deleteTipoFisico(id: string): Promise<boolean> {
    const res = await this.prisma.tipoMedidor.delete({ where: { id } });
    return !!res;
  }

  async countMedidoresByTipo(tipoId: string): Promise<number> {
    return await this.prisma.medidor.count({ where: { tipoMedidorId: tipoId } });
  }

  async findMedidorById(id: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({
      where: { id },
      include: {
        medidorPadre: { select: { id: true, codigo: true } },
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    if (!m) return null;
    const ult = m.lecturas?.[0];
    return {
      ...m,
      tipoMedidor: m.tipoMedidor
        ? {
            ...m.tipoMedidor,
            recurso: m.tipoMedidor.recurso as RecursoMedidor,
            unidad: m.tipoMedidor.unidad as UnidadMedida,
            unidadMedida: m.tipoMedidor.unidad,
            tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
          }
        : undefined,
      ultimaLectura: ult
        ? {
            valor: ult.valor,
            timestamp: ult.fechaLectura,
            fechaLectura: ult.fechaLectura,
            fecha: ult.fechaLectura,
          }
        : null,
    };
  }

  async findMedidorByCodigo(codigo: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({ where: { codigo } });
    if (!m) return null;
    return m as unknown as MedidorEntity;
  }

  async findMedidorByCodigoExterno(codigoExterno: string): Promise<MedidorEntity | null> {
    const m = await this.prisma.medidor.findUnique({ where: { codigoExterno } });
    if (!m) return null;
    return m as unknown as MedidorEntity;
  }

  async createMedidor(
    data: Omit<MedidorEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<MedidorEntity> {
    return (await this.prisma.medidor.create({
      data: {
        instalacionId: data.instalacionId,
        tipoMedidorId: data.tipoMedidorId,
        codigo: data.codigo,
        codigoExterno: data.codigoExterno ?? null,
        factorInstalacion: data.factorInstalacion ?? null,
        numeroSerie: data.numeroSerie,
        ubicacionInterna: data.ubicacionInterna,
        activo: data.activo,
      },
    })) as unknown as MedidorEntity;
  }

  async updateMedidor(id: string, data: Partial<MedidorEntity>): Promise<MedidorEntity> {
    if ("$transaction" in this.prisma) return this.conTransaccion(repo => repo.updateMedidor(id, data));
    const actual = await this.findMedidorById(id);
    if (actual) {
      if (data.activo === false && await this.countHijosActivos(id)) throw new JerarquiaError("MEDIDOR_CON_REMARCADORES_ACTIVOS", "El medidor tiene remarcadores activos.");
      if (data.activo === true && actual.medidorPadreId && !(await this.findMedidorById(actual.medidorPadreId))?.activo) throw new JerarquiaError("MEDIDOR_PADRE_INCOMPATIBLE", "El padre debe estar activo.");
      if (data.tipoMedidorId && data.tipoMedidorId !== actual.tipoMedidorId) {
        const tipo = await this.findTipoById(data.tipoMedidorId);
        if (tipo && (await this.countVinculos(id) || await this.countLecturas(id)) &&
          (tipo.recurso !== actual.tipoMedidor?.recurso || tipo.unidad !== actual.tipoMedidor?.unidad || tipo.tipoMedicion !== actual.tipoMedidor?.tipoMedicion)) {
          throw new JerarquiaError("TIPO_MEDIDOR_CON_HISTORIAL_INCOMPATIBLE", "El cambio de tipo alteraría el significado de lecturas o vínculos históricos.");
        }
      }
    }
    return (await this.prisma.medidor.update({
      where: { id },
      data: {
        ...(data.tipoMedidorId !== undefined && { tipoMedidorId: data.tipoMedidorId }),
        ...(data.codigo !== undefined && { codigo: data.codigo }),
        ...(data.codigoExterno !== undefined && { codigoExterno: data.codigoExterno }),
        ...(data.factorInstalacion !== undefined && { factorInstalacion: data.factorInstalacion }),
        ...(data.numeroSerie !== undefined && { numeroSerie: data.numeroSerie }),
        ...(data.ubicacionInterna !== undefined && { ubicacionInterna: data.ubicacionInterna }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
      include: { tipoMedidor: true, medidorPadre: { select: { id: true, codigo: true } } },
    })) as unknown as MedidorEntity;
  }

  async countLecturas(medidorId: string): Promise<number> {
    return await this.prisma.lectura.count({
      where: { medidorId },
    });
  }

  async deleteMedidorFisico(id: string): Promise<boolean> {
    const res = await this.prisma.medidor.delete({
      where: { id },
    });
    return !!res;
  }

  async listMedidoresByInstalacion(
    instalacionId: string,
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorEntity[]> {
    const where: { instalacionId: string; activo?: boolean } = { instalacionId };
    if (estado === "activos" || !estado) {
      where.activo = true;
    } else if (estado === "archivados") {
      where.activo = false;
    }
    const list = await this.prisma.medidor.findMany({
      where,
      include: {
        medidorPadre: { select: { id: true, codigo: true } },
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    return list.map((m) => {
      const ult = m.lecturas?.[0];
      return {
        ...m,
        tipoMedidor: m.tipoMedidor
          ? {
              ...m.tipoMedidor,
              recurso: m.tipoMedidor.recurso as RecursoMedidor,
              unidad: m.tipoMedidor.unidad as UnidadMedida,
              unidadMedida: m.tipoMedidor.unidad,
              tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
            }
          : undefined,
        ultimaLectura: ult
          ? {
              valor: ult.valor,
              timestamp: ult.fechaLectura,
              fechaLectura: ult.fechaLectura,
              fecha: ult.fechaLectura,
            }
          : null,
      };
    });
  }

  async listMedidores(
    instalacionIds?: string[],
    estado?: "activos" | "archivados" | "todos"
  ): Promise<MedidorEntity[]> {
    const where: { activo?: boolean; instalacionId?: { in: string[] } } = {};
    if (estado === "activos" || !estado) {
      where.activo = true;
    } else if (estado === "archivados") {
      where.activo = false;
    }
    if (instalacionIds !== undefined) {
      where.instalacionId = { in: instalacionIds };
    }
    const list = await this.prisma.medidor.findMany({
      where,
      include: {
        medidorPadre: { select: { id: true, codigo: true } },
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "desc" },
          take: 1,
        },
      },
    });
    return list.map((m) => {
      const ult = m.lecturas?.[0];
      return {
        ...m,
        tipoMedidor: m.tipoMedidor
          ? {
              ...m.tipoMedidor,
              recurso: m.tipoMedidor.recurso as RecursoMedidor,
              unidad: m.tipoMedidor.unidad as UnidadMedida,
              unidadMedida: m.tipoMedidor.unidad,
              tipoMedicion: m.tipoMedidor.tipoMedicion as TipoMedicion,
            }
          : undefined,
        ultimaLectura: ult
          ? {
              valor: ult.valor,
              timestamp: ult.fechaLectura,
              fechaLectura: ult.fechaLectura,
              fecha: ult.fechaLectura,
            }
          : null,
      };
    });
  }
}
