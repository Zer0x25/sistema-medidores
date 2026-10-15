import { Prisma, PrismaClient } from "@prisma/client";
import { IDashboardRepository, DashboardRawData, RawLectura, RawMedidor } from "./dashboard.service.js";
import { DashboardIntervalosQuery, DashboardSerieQuery } from "./dashboard.schema.js";

export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async graphMeters(filtro: Pick<DashboardSerieQuery, "medidorId" | "instalacionId" | "recurso">, allowedIds?: string[]): Promise<RawMedidor[]> {
    const where: Prisma.MedidorWhereInput = {
      AND: [
        ...(allowedIds === undefined ? [] : [{ instalacionId: { in: allowedIds } }]),
        ...(filtro.instalacionId ? [{ instalacionId: filtro.instalacionId }] : []),
      ],
      ...(filtro.medidorId ? { id: filtro.medidorId } : {}),
      tipoMedidor: { tipoMedicion: "ACUMULATIVO", ...(filtro.recurso ? { recurso: filtro.recurso } : {}) },
    };
    const ms = await this.prisma.medidor.findMany({ where, include: { instalacion: true, tipoMedidor: true, vinculos: true }, orderBy: { codigo: "asc" } });
    return ms.map(m => ({ id: m.id, codigo: m.codigo, instalacionId: m.instalacionId, instalacionNombre: m.instalacion.nombre,
      ubicacionInterna: m.ubicacionInterna, recurso: m.tipoMedidor.recurso, unidad: m.tipoMedidor.unidad,
      tipoMedicion: m.tipoMedidor.tipoMedicion, activo: m.activo, medidorPadreId: m.medidorPadreId, createdAt: m.createdAt, vinculos: m.vinculos }));
  }

  async getGraphSummaryData(filtro: DashboardSerieQuery, allowedIds?: string[]): Promise<DashboardRawData> {
    const medidores = await this.graphMeters(filtro, allowedIds);
    if (!medidores.length) return { instalaciones: [], medidores: [], lecturas: [], recargas: [] };
    const inicio = filtro.fechaInicio?.getTime() ?? null;
    const fin = filtro.fechaFin?.getTime() ?? Number.MAX_SAFE_INTEGER;
    // SQLite inspecciona continuidad, pero devuelve únicamente extremos y la primera
    // evidencia inválida (junto a su predecesora): máximo cuatro filas por medidor.
    const filas = await this.prisma.$queryRaw<Array<Omit<RawLectura, "fechaLectura"> & { fechaLectura: bigint | number }>>(Prisma.sql`
      WITH ordenadas AS (
        SELECT l.*, ROW_NUMBER() OVER (PARTITION BY medidorId ORDER BY fechaLectura, id) AS pos,
          ROW_NUMBER() OVER (PARTITION BY medidorId ORDER BY fechaLectura DESC, id DESC) AS ultima,
          FIRST_VALUE(multiplicadorAplicado) OVER (PARTITION BY medidorId ORDER BY fechaLectura, id) AS factor,
          LAG(valor) OVER (PARTITION BY medidorId ORDER BY fechaLectura, id) AS anterior
        FROM lecturas l WHERE medidorId IN (${Prisma.join(medidores.map(m => m.id))}) AND fechaLectura <= ${fin}
          AND (${inicio} IS NULL OR fechaLectura >= COALESCE((SELECT MAX(a.fechaLectura) FROM lecturas a WHERE a.medidorId = l.medidorId AND a.fechaLectura <= ${inicio}), -8640000000000000))
      ), evidencias AS (
        SELECT *, MIN(CASE WHEN multiplicadorAplicado IS NULL OR multiplicadorAplicado IS NOT factor OR valor < anterior THEN pos END)
          OVER (PARTITION BY medidorId) AS errorPos FROM ordenadas
      ) SELECT id, medidorId, valor, multiplicadorAplicado, fechaLectura, operadorId, notas FROM evidencias
        WHERE pos = 1 OR ultima = 1 OR pos = errorPos OR pos = errorPos - 1 ORDER BY medidorId, fechaLectura
    `);
    return { instalaciones: [], medidores, lecturas: filas.map(l => ({ ...l, fechaLectura: new Date(Number(l.fechaLectura)) })), recargas: [] };
  }

  async getIntervalos(filtro: DashboardIntervalosQuery, allowedIds?: string[]) {
    const medidor = (await this.graphMeters(filtro, allowedIds)).find(m => m.activo) ?? null;
    if (!medidor) return { medidor: null, lecturas: [], total: 0 };
    const where: Prisma.LecturaWhereInput = { medidorId: medidor.id,
      fechaLectura: { ...(filtro.fechaInicio ? { gte: filtro.fechaInicio } : {}), ...(filtro.fechaFin ? { lte: filtro.fechaFin } : {}) } };
    const [total, lecturas] = await this.prisma.$transaction([
      this.prisma.lectura.count({ where }),
      this.prisma.lectura.findMany({ where, orderBy: [{ fechaLectura: "desc" }, { id: "desc" }], skip: (filtro.pagina - 1) * filtro.tamanio, take: filtro.tamanio }),
    ]);
    const ultima = lecturas.at(-1);
    const anterior = ultima ? await this.prisma.lectura.findFirst({ where: { medidorId: medidor.id, fechaLectura: { lt: ultima.fechaLectura } }, orderBy: { fechaLectura: "desc" } }) : null;
    return { medidor, total, lecturas: anterior ? [...lecturas, anterior] : lecturas };
  }

  async getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData> {
    const whereInst: { activa: boolean; id?: { in: string[] } } = { activa: true };
    if (allowedInstalacionIds !== undefined) {
      whereInst.id = { in: allowedInstalacionIds };
    }

    const instalaciones = await this.prisma.instalacion.findMany({
      where: whereInst,
      select: {
        id: true,
        nombre: true,
        activa: true,
      },
    });

    const whereMed: { instalacionId?: { in: string[] } } = {};
    if (allowedInstalacionIds !== undefined) {
      whereMed.instalacionId = { in: allowedInstalacionIds };
    }

    const medidores = await this.prisma.medidor.findMany({
      where: whereMed,
      include: {
        vinculos: { orderBy: { vigenteDesde: "asc" } },
        instalacion: { select: { nombre: true } },
        tipoMedidor: {
          select: {
            recurso: true,
            unidad: true,
            tipoMedicion: true,
          },
        },
      },
    });

    const whereLec: { medidor?: { instalacionId?: { in: string[] } } } = {};
    if (allowedInstalacionIds !== undefined) {
      whereLec.medidor = { instalacionId: { in: allowedInstalacionIds } };
    }

    const lecturas = await this.prisma.lectura.findMany({
      where: whereLec,
      select: {
        id: true,
        medidorId: true,
        valor: true,
        multiplicadorAplicado: true,
        fechaLectura: true,
        operadorId: true,
        notas: true,
      },
    });

    const medidorIds = medidores.map((m) => m.id);
    const regs = medidorIds.length > 0
      ? await this.prisma.registroMantenimiento.findMany({
          where: { medidorId: { in: medidorIds }, tipo: "RECARGA_TANQUE" },
          select: { medidorId: true, volumenRecargado: true, fechaMantenimiento: true },
        })
      : [];

    return {
      instalaciones,
      medidores: medidores.map((m) => ({
        id: m.id,
        medidorPadreId: m.medidorPadreId, vinculos: m.vinculos, createdAt: m.createdAt,
        codigo: m.codigo,
        instalacionId: m.instalacionId,
        instalacionNombre: m.instalacion.nombre,
        ubicacionInterna: m.ubicacionInterna,
        recurso: m.tipoMedidor.recurso,
        unidad: m.tipoMedidor.unidad,
        tipoMedicion: m.tipoMedidor.tipoMedicion,
        activo: m.activo,
      })),
      lecturas,
      recargas: regs.map((r) => ({
        medidorId: r.medidorId,
        volumen: (r as unknown as { volumenRecargado?: number | null }).volumenRecargado ?? 0,
        fecha: r.fechaMantenimiento,
      })),
    };
  }
}
