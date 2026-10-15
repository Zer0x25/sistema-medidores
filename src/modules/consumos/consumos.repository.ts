import { Prisma, PrismaClient } from "@prisma/client";
import { EquipoConsumo, IConsumosRepository } from "./consumos.service.js";
const include = { tipoMedidor: true, lecturas: { orderBy: { fechaLectura: "asc" as const } }, vinculos: { orderBy: { vigenteDesde: "asc" as const } } };
type Medidor = Prisma.MedidorGetPayload<{ include: typeof include }>;
function equipo(m: Medidor): EquipoConsumo {
  return { ...m, recurso: m.tipoMedidor.recurso, unidad: m.tipoMedidor.unidad, tipoMedicion: m.tipoMedidor.tipoMedicion };
}
export class PrismaConsumosRepository implements IConsumosRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async obtenerMedidor(id: string): Promise<EquipoConsumo | null> {
    const m = await this.prisma.medidor.findUnique({ where: { id }, include: {
      ...include, lecturas: { orderBy: { fechaLectura: "desc" }, take: 2 },
    } });
    return m ? equipo(m) : null;
  }
  async obtenerInstalacion(id: string, fin: Date): Promise<EquipoConsumo[] | null> {
    const inst = await this.prisma.instalacion.findUnique({ where: { id }, select: { id: true } });
    if (!inst) return null;
    const ms = await this.prisma.medidor.findMany({ where: { instalacionId: id }, include: {
      ...include, lecturas: { where: { fechaLectura: { lte: fin } }, orderBy: { fechaLectura: "asc" } },
    } });
    return ms.map(equipo);
  }
}
