import { describe, expect, it } from "vitest";
import { calcularConsumo, construirBalance, EquipoConsumo } from "../../../src/modules/consumos/consumos.service.js";
import { ConsumoResponseSchema } from "../../../src/modules/consumos/consumos.schema.js";
const inicio = new Date("2026-01-01T00:00:00Z");
const fin = new Date("2026-02-01T00:00:00Z");
function equipo(codigo: string, delta: number, padre: string | null = null): EquipoConsumo {
  return { id: codigo, codigo, instalacionId: "sede", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO", activo: true,
    createdAt: new Date("2025-01-01Z"), medidorPadreId: padre,
    vinculos: padre ? [{ medidorPadreId: padre, vigenteDesde: new Date("2025-12-01Z") }] : [],
    lecturas: [{ id: `${codigo}a`, valor: 1250, fechaLectura: inicio, multiplicadorAplicado: 1 },
      { id: `${codigo}b`, valor: 1250 + delta, fechaLectura: fin, multiplicadorAplicado: 1 }] };
}
describe("Consumo temporal y balance por sectores", () => {
  it("resta lecturas reales sin multiplicar el factor nuevamente", () => {
    const m = equipo("a", 130); m.lecturas.forEach(l => l.multiplicadorAplicado = 20);
    const c = calcularConsumo(m, inicio, fin);
    expect(c.consumo).toBe(130); expect(c.cobertura).toBe("COMPLETA");
    expect(ConsumoResponseSchema.parse(c)).toEqual(c);
  });
  it.each([0, 1])("%i lecturas son insuficientes, no cero", n => {
    const m = equipo("a", 0); m.lecturas = m.lecturas.slice(0, n);
    expect(calcularConsumo(m).consumo).toBeNull();
    expect(calcularConsumo(m).estado).toBe("DATOS_INSUFICIENTES");
  });
  it("cero real requiere dos observaciones", () => expect(calcularConsumo(equipo("a", 0)).consumo).toBe(0));
  it("selecciona referencia previa al inicio y explicita cobertura parcial", () => {
    const m = equipo("a", 130);
    m.lecturas.push({ id: "posterior", valor: 1600, fechaLectura: new Date("2026-03-01Z"), multiplicadorAplicado: 1 });
    const c = calcularConsumo(m, new Date("2026-01-02Z"), fin);
    expect(c.consumo).toBe(130); expect(c.lecturaInicial?.id).toBe("aa"); expect(c.cobertura).toBe("PARCIAL");
  });
  it("no usa la primera lectura posterior al inicio como apertura", () => {
    expect(calcularConsumo(equipo("a", 130), new Date("2025-12-01Z"), fin).estado).toBe("DATOS_INSUFICIENTES");
  });
  it("detecta discontinuidad de factor incluso en puntos intermedios", () => {
    const m = equipo("a", 130);
    m.lecturas.push({ id: "medio", valor: 1300, fechaLectura: new Date("2026-01-15Z"), multiplicadorAplicado: 2 });
    expect(calcularConsumo(m).motivo).toBe("FACTOR_NO_COMPARABLE");
  });
  it("no oculta lecturas decrecientes", () => expect(calcularConsumo(equipo("a", -5)).estado).toBe("NO_COMPARABLE"));
  it("calcula hijos directos, nietos, hojas y total sin doble conteo", () => {
    const b = construirBalance("sede", [equipo("General", 100), equipo("A", 40, "General"), equipo("B", 35, "General"), equipo("Cocina", 10, "A"), equipo("Lavanderia", 15, "A")], inicio, fin);
    expect(b.nodos.find(n => n.medidorId === "General")?.saldoSinDistribuir).toBe(25);
    expect(b.nodos.find(n => n.medidorId === "A")?.saldoSinDistribuir).toBe(15);
    expect(b.nodos.find(n => n.medidorId === "Cocina")?.saldoSinDistribuir).toBe(10);
    expect(b.totales[0].consumo).toBe(100);
    expect(b.nodos.map(n => n.profundidad)).toEqual([0, 1, 2, 2, 1]);
  });
  it("un hijo sin cierre invalida el saldo sin ocultar el consumo del padre", () => {
    const h = equipo("h", 10, "p"); h.lecturas.pop();
    const p = construirBalance("sede", [equipo("p", 100), h], inicio, fin).nodos[0];
    expect(p.saldoSinDistribuir).toBeNull(); expect(p.consumoPropio.consumo).toBe(100);
  });
  it("fechas distintas no se comparan y saldo negativo conserva su signo", () => {
    const h = equipo("h", 110, "p");
    let p = construirBalance("sede", [equipo("p", 100), h], inicio, fin).nodos[0];
    expect(p.saldoSinDistribuir).toBe(-10); expect(p.motivos).toContain("HIJOS_SUPERAN_PADRE");
    h.lecturas[0].fechaLectura = new Date(inicio.getTime() - 1000);
    p = construirBalance("sede", [equipo("p", 100), h], inicio, fin).nodos[0];
    expect(p.saldoSinDistribuir).toBeNull(); expect(p.motivos).toContain("PERIODOS_NO_ALINEADOS");
  });
  it("reconstruye padre histórico e invalida intervalos que cruzan un cambio", () => {
    const h = equipo("h", 10, "otro");
    h.vinculos = [{ medidorPadreId: "p", vigenteDesde: new Date("2025-12-01Z") }, { medidorPadreId: "otro", vigenteDesde: new Date("2026-02-15Z") }];
    const equipos = [equipo("p", 100), h, equipo("otro", 30)];
    expect(construirBalance("sede", equipos, inicio, fin).nodos.find(n => n.medidorId === "h")?.medidorPadreId).toBe("p");
    h.vinculos[1].vigenteDesde = new Date("2026-01-15Z");
    expect(construirBalance("sede", equipos, inicio, fin).totales[0].consumo).toBeNull();
  });
  it("incluye archivados históricos y separa unidades y recursos", () => {
    const h = equipo("h", 20, "p"); h.activo = false;
    const otro = equipo("l", 1000); otro.unidad = "LITROS";
    const b = construirBalance("sede", [equipo("p", 100), h, otro], inicio, fin);
    expect(b.nodos.find(n => n.medidorId === "p")?.saldoSinDistribuir).toBe(80); expect(b.totales).toHaveLength(2);
  });
  it("raíces con fechas distintas no producen un falso total", () => {
    const b = equipo("b", 20); b.lecturas[0].fechaLectura = new Date(inicio.getTime() - 1000);
    expect(construirBalance("sede", [equipo("a", 100), b], inicio, fin).totales[0].consumo).toBeNull();
  });
  it.each(["NIVEL", "INSTANTANEO"])("el delta acumulativo no aplica al modo %s", modo => {
    const m = equipo("m", 20); m.tipoMedicion = modo;
    expect(calcularConsumo(m)).toMatchObject({ estado: "NO_APLICA", consumo: null, motivo: "MODO_NO_ACUMULATIVO" });
  });
  it("un snapshot desconocido no acredita continuidad metrológica", () => {
    const m = equipo("m", 20);
    const lecturas = m.lecturas.map(l => ({ ...l, multiplicadorAplicado: null }));
    expect(calcularConsumo({ ...m, lecturas }).estado).toBe("NO_COMPARABLE");
  });

});
