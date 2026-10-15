import { PrismaClient } from "@prisma/client";
import { IDashboardRepository, DashboardRawData } from "./dashboard.service.js";

export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
