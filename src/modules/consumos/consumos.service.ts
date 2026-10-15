import { BalanceNodo, BalanceQuery, BalanceResponse, ConsumoError, ConsumoResponse } from "./consumos.schema.js";

export interface LecturaConsumo { id: string; valor: number; fechaLectura: Date; multiplicadorAplicado?: number | null }
export interface VinculoConsumo { medidorPadreId: string | null; vigenteDesde: Date }
export interface EquipoConsumo {
  id: string; codigo: string; instalacionId: string; recurso: string; unidad: string; tipoMedicion: string;
  activo: boolean; createdAt: Date; medidorPadreId: string | null;
  lecturas: LecturaConsumo[]; vinculos: VinculoConsumo[];
}
export interface IConsumosRepository {
  obtenerMedidor(id: string): Promise<EquipoConsumo | null>;
  obtenerInstalacion(id: string, fin: Date): Promise<EquipoConsumo[] | null>;
}
const cent = (v: number) => Math.round(v * 100);
function punto(l: LecturaConsumo | undefined) {
  return l ? { ...l, multiplicadorAplicado: l.multiplicadorAplicado ?? null, timestamp: l.fechaLectura, fecha: l.fechaLectura } : null;
}
export function calcularConsumo(m: Pick<EquipoConsumo, "id" | "unidad" | "tipoMedicion" | "lecturas">, inicio?: Date, fin?: Date): ConsumoResponse {
  const ordenadas = [...m.lecturas].sort((a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime());
  const final = ordenadas.filter(l => !fin || l.fechaLectura <= fin).at(-1);
  const inicial = inicio ? ordenadas.filter(l => l.fechaLectura <= inicio).at(-1) : ordenadas.at(-2);
  const base = { medidorId: m.id, unidad: m.unidad, lecturaInicial: punto(inicial), lecturaFinal: punto(final),
    fechaInicioSolicitada: inicio ?? null, fechaFinSolicitada: fin ?? null, cobertura: "INSUFICIENTE" as const };
  if (m.tipoMedicion !== "ACUMULATIVO") return { ...base, estado: "NO_APLICA", motivo: "MODO_NO_ACUMULATIVO", consumo: null };
  if (!inicial || !final || inicial.id === final.id || (inicio && final.fechaLectura <= inicio)) {
    return { ...base, estado: "DATOS_INSUFICIENTES", consumo: null,
      motivo: !inicial && inicio ? "SIN_LECTURA_INICIAL" : !final ? "SIN_LECTURA_FINAL" : "SIN_DOS_LECTURAS" };
  }
  const tramo = ordenadas.filter(l => l.fechaLectura >= inicial.fechaLectura && l.fechaLectura <= final.fechaLectura);
  const factor = inicial.multiplicadorAplicado;
  // undefined se admite para adaptadores legacy en memoria; un snapshot null explícito no acredita continuidad.
  if (factor === null || tramo.some(l => l.multiplicadorAplicado === null || (l.multiplicadorAplicado ?? 1) !== (factor ?? 1))) {
    return { ...base, estado: "NO_COMPARABLE", consumo: null, motivo: "FACTOR_NO_COMPARABLE" };
  }
  if (tramo.some((l, i) => i > 0 && l.valor < tramo[i - 1].valor)) {
    return { ...base, estado: "NO_COMPARABLE", consumo: null, motivo: "LECTURAS_INCOHERENTES" };
  }
  return { ...base, estado: "CALCULADO", motivo: null, consumo: (cent(final.valor) - cent(inicial.valor)) / 100,
    cobertura: !inicio || !fin || (inicial.fechaLectura.getTime() === inicio.getTime() && final.fechaLectura.getTime() === fin.getTime()) ? "COMPLETA" : "PARCIAL" };
}
function padreEn(m: EquipoConsumo, fecha: Date): string | null {
  return [...m.vinculos].filter(v => v.vigenteDesde <= fecha)
    .sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime())[0]?.medidorPadreId ?? null;
}
function alineados(a: ConsumoResponse, b: ConsumoResponse): boolean {
  return a.estado === "CALCULADO" && b.estado === "CALCULADO"
    && a.lecturaInicial?.fechaLectura.getTime() === b.lecturaInicial?.fechaLectura.getTime()
    && a.lecturaFinal?.fechaLectura.getTime() === b.lecturaFinal?.fechaLectura.getTime();
}
export function construirBalance(instalacionId: string, equipos: EquipoConsumo[], inicio: Date, fin: Date): BalanceResponse {
  const candidatos = equipos.filter(m => m.tipoMedicion === "ACUMULATIVO" && m.createdAt <= fin);
  const consumos = new Map(candidatos.map(m => [m.id, calcularConsumo(m, inicio, fin)]));
  const padres = new Map(candidatos.map(m => [m.id, padreEn(m, consumos.get(m.id)?.lecturaInicial?.fechaLectura ?? inicio)]));
  const cambiados = new Set(candidatos.filter(m => {
    const c = consumos.get(m.id)!;
    const desde = c.lecturaInicial?.fechaLectura ?? inicio;
    const hasta = c.lecturaFinal?.fechaLectura ?? fin;
    return m.vinculos.some(v => v.vigenteDesde > desde && v.vigenteDesde <= hasta);
  }).map(m => m.id));
  const hijos = new Map<string | null, EquipoConsumo[]>();
  for (const m of candidatos) {
    const p = padres.get(m.id) ?? null;
    hijos.set(p, [...(hijos.get(p) ?? []), m]);
  }
  for (const lista of hijos.values()) lista.sort((a, b) => a.codigo.localeCompare(b.codigo) || a.id.localeCompare(b.id));
  const nodos: BalanceNodo[] = [];
  const visitados = new Set<string>();
  const pendientes = [...(hijos.get(null) ?? [])].reverse().map(m => ({ m, profundidad: 0 }));
  // La segunda pasada hace visibles las entidades incluso ante una topología corrupta.
  const agregar = (m: EquipoConsumo, profundidad: number) => {
    const c = consumos.get(m.id)!;
    const directos = hijos.get(m.id) ?? [];
    const nodo: BalanceNodo = { medidorId: m.id, medidorCodigo: m.codigo, medidorPadreId: padres.get(m.id) ?? null,
      profundidad, recurso: m.recurso, unidad: m.unidad, consumoPropio: c, hijosDirectos: directos.map(h => h.id),
      consumoDistribuido: null, saldoSinDistribuir: null, estado: "CALCULADO", motivos: [], participaEnTotal: !padres.get(m.id) };
    if (c.estado !== "CALCULADO" || directos.some(h => consumos.get(h.id)?.estado !== "CALCULADO")) {
      nodo.estado = "DATOS_INSUFICIENTES"; nodo.motivos.push("DATOS_INSUFICIENTES");
    } else if (directos.some(h => !alineados(c, consumos.get(h.id)!))) {
      nodo.estado = "NO_COMPARABLE"; nodo.motivos.push("PERIODOS_NO_ALINEADOS");
    } else {
      nodo.consumoDistribuido = directos.reduce((s, h) => s + cent(consumos.get(h.id)!.consumo!), 0) / 100;
      nodo.saldoSinDistribuir = (cent(c.consumo!) - cent(nodo.consumoDistribuido)) / 100;
      if (nodo.saldoSinDistribuir < 0) { nodo.estado = "ADVERTENCIA"; nodo.motivos.push("HIJOS_SUPERAN_PADRE"); }
    }
    if (cambiados.has(m.id) || directos.some(h => cambiados.has(h.id)) || candidatos.some(h => cambiados.has(h.id) && h.vinculos.some(v => v.medidorPadreId === m.id && v.vigenteDesde <= fin))) {
      nodo.estado = "NO_COMPARABLE"; nodo.motivos.push("VINCULO_CAMBIO_EN_PERIODO"); nodo.consumoDistribuido = nodo.saldoSinDistribuir = null;
    }
    nodos.push(nodo);
  };
  while (pendientes.length) {
    const { m, profundidad } = pendientes.pop()!;
    if (visitados.has(m.id)) continue;
    visitados.add(m.id); agregar(m, profundidad);
    for (const h of [...(hijos.get(m.id) ?? [])].reverse()) pendientes.push({ m: h, profundidad: profundidad + 1 });
  }
  for (const m of candidatos.filter(m => !visitados.has(m.id))) {
    agregar(m, 0); const n = nodos.at(-1)!;
    n.estado = "NO_COMPARABLE"; n.motivos.push("JERARQUIA_INCOHERENTE"); n.consumoDistribuido = n.saldoSinDistribuir = null;
  }
  const grupos = new Map<string, BalanceNodo[]>();
  for (const n of nodos) { const k = `${n.recurso}:${n.unidad}`; grupos.set(k, [...(grupos.get(k) ?? []), n]); }
  const totales: BalanceResponse["totales"] = [...grupos.values()].map(lista => {
    const raices = lista.filter(n => n.participaEnTotal);
    const ref = raices[0]?.consumoPropio;
    const insuf = !ref || raices.some(n => n.consumoPropio.estado !== "CALCULADO");
    const noComparable = lista.some(n => n.motivos.includes("VINCULO_CAMBIO_EN_PERIODO") || n.motivos.includes("JERARQUIA_INCOHERENTE")) || (!insuf && raices.some(n => !alineados(ref, n.consumoPropio)));
    const valido = !insuf && !noComparable;
    return { recurso: lista[0].recurso, unidad: lista[0].unidad,
      consumo: valido ? raices.reduce((s, n) => s + cent(n.consumoPropio.consumo!), 0) / 100 : null,
      estado: noComparable ? "NO_COMPARABLE" : insuf ? "DATOS_INSUFICIENTES" : "CALCULADO",
      cobertura: !valido ? "INSUFICIENTE" : raices.every(n => n.consumoPropio.cobertura === "COMPLETA") ? "COMPLETA" : "PARCIAL",
      fechaInicialReal: valido ? ref.lecturaInicial!.fechaLectura : null, fechaFinalReal: valido ? ref.lecturaFinal!.fechaLectura : null };
  });
  return { instalacionId, fechaInicio: inicio, fechaFin: fin, nodos, totales };
}
export class ConsumosService {
  constructor(private readonly repository: IConsumosRepository) {}
  async consumoActual(id: string, allowedIds?: string[]): Promise<ConsumoResponse> {
    const m = await this.repository.obtenerMedidor(id);
    if (!m) throw new ConsumoError("MEDIDOR_NOT_FOUND", 404, "Medidor no encontrado.");
    this.validarAcceso(m.instalacionId, allowedIds);
    return calcularConsumo(m);
  }
  async balance(query: BalanceQuery, allowedIds?: string[]): Promise<BalanceResponse> {
    this.validarAcceso(query.instalacionId, allowedIds);
    if (query.fechaInicio >= query.fechaFin || query.fechaFin.getTime() > Date.now()) throw new ConsumoError("RANGO_FECHAS_INVALIDO", 400, "El período debe ser creciente y no futuro.");
    const ms = await this.repository.obtenerInstalacion(query.instalacionId, query.fechaFin);
    if (!ms) throw new ConsumoError("INSTALACION_NOT_FOUND", 404, "Instalación no encontrada.");
    return construirBalance(query.instalacionId, ms, query.fechaInicio, query.fechaFin);
  }
  private validarAcceso(id: string, allowedIds?: string[]) {
    if (allowedIds !== undefined && !allowedIds.includes(id)) throw new ConsumoError("INSTALACION_NO_ASIGNADA", 403, "Instalación no asignada.");
  }
}
