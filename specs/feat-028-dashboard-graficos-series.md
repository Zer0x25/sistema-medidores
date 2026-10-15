# Spec: feat-028-dashboard-graficos-series

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Dotar al Dashboard Ejecutivo (`#/dashboard`) de capacidad gráfica real: evolución temporal por medidor (línea), comparativa de consumo por instalación (barras) y distribución por recurso (dona), con filtros por instalación / medidor / recurso / rango de fechas. Sin nuevas dependencias npm (Canvas 2D nativo, CSP-safe y offline-first).
- **Archivos editables autorizados:**
  - `src/modules/dashboard/dashboard.schema.ts`
  - `src/modules/dashboard/dashboard.service.ts`
  - `src/modules/dashboard/dashboard.controller.ts`
  - `src/modules/dashboard/dashboard.repository.ts`
  - `tests/modules/dashboard/dashboard.series.test.ts`
  - `public/js/api.js`
  - `public/js/charts.js`
  - `public/js/components.js`
  - `public/app.js`
  - `public/index.html`
  - `public/app.css`
  - `e2e/dashboard-graficos.spec.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - `src/server.ts` (RBAC `/api/dashboard/*` ya bloquea OPERADOR; sin cambios)
  - Todo archivo fuera de la lista autorizada

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Query de series (entrada, querystring con coerción)

```typescript
export const DashboardSerieQuerySchema = z.object({
  medidorId: z.string().uuid().optional(),
  instalacionId: z.string().uuid().optional(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]).optional(),
  fechaInicio: z.coerce.date().optional(),
  fechaFin: z.coerce.date().optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});
export type DashboardSerieQuery = z.infer<typeof DashboardSerieQuerySchema>;
```

- `fechaInicio` / `fechaFin` opcionales; si ambas presentes y `inicio > fin` → `RangoFechasInvalidoError` (400).
- Query inválida (uuid malformado, recurso fuera de enum, limite fuera de 1..500) → `400 VALIDATION_ERROR` en controlador.
- Sin filtros → devuelve hasta `limite` puntos por medidor activo visible.

### B. Salida (respuesta HTTP 200)

```typescript
export const DashboardSeriePuntoSchema = z.object({
  fecha: z.date(),
  valor: z.number(),
});
export const DashboardSerieMedidorSchema = z.object({
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  puntos: z.array(DashboardSeriePuntoSchema).max(500),
});
export type DashboardSerieMedidor = z.infer<typeof DashboardSerieMedidorSchema>;
```

- `GET /api/dashboard/series` → `200` array de `DashboardSerieMedidor`.
- Puntos ordenados cronológicamente **ascendente** (apto para línea temporal).
- Solo medidores `activo === true`. Medidor sin lecturas en rango → `puntos: []` (no se omite).
- Agregados por instalación / dona por recurso se derivan en frontend desde `GET /api/dashboard/consumos` + `GET /api/dashboard/kpis` existentes (sin nuevo endpoint agregado).

---

## 3. Catálogo de Errores de Dominio Tipados

```typescript
export class RangoFechasInvalidoError extends DomainError {
  readonly code = "RANGO_FECHAS_INVALIDO";
  readonly statusCode = 400;
}
export class InstalacionNoAsignadaError extends DomainError {
  readonly code = "INSTALACION_NO_ASIGNADA";
  readonly statusCode = 403;
}
export type DashboardErrorCode = "RANGO_FECHAS_INVALIDO" | "INSTALACION_NO_ASIGNADA";
```

- Prohibido `throw new Error(...)`.
- Controlador mapea `DomainError` → su `statusCode`; Zod/query inválida → `400 VALIDATION_ERROR`.

---

## 4. Invariantes del Negocio

### A. Positivas
1. **Solo lectura:** el módulo jamás muta lecturas, medidores ni instalaciones.
2. **Orden determinista:** puntos por medidor siempre ascendentes por `fechaLectura`; desempate por `valor`.
3. **Capado:** nunca más de `limite` puntos por medidor (se conservan los más recientes).
4. **Filtros combinables:** `instalacionId + recurso + rango fechas` se aplican en conjunción (AND).
5. **Accesibilidad:** cada `<canvas>` con `role="img"`, `aria-label` y texto fallback + tabla resumida si vacío.

### B. Negativas
1. **Fail-closed territorial (Regla 25):** si `allowedInstalacionIds !== undefined`, el servicio opera solo sobre ese conjunto; `[]` → `[]`. `?instalacionId=` ajena → `403 INSTALACION_NO_ASIGNADA`. `?medidorId=` invisible → `[]` (sin fuga de datos ajenos).
2. **Sin dependencias nuevas:** prohibido `npm install` (chart.js, echarts, plotly). Render con Canvas 2D nativo en `public/js/charts.js`.
3. **Sin `any`:** TypeScript estricto en `src/` y `tests/`; frontend sin `eval` ni `innerHTML` con datos sin escapar.
4. **Pureza de capas:** controlador solo HTTP↔DTO; servicio solo agregación; repositorio solo lectura (se reutiliza `getDashboardData`, sin cambios de esquema Prisma).
5. **RBAC:** `OPERADOR` sigue bloqueado en `/api/dashboard/*` por `server.ts` (403). Sin cambios perimetrales.

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Tests de servicio (Vitest, `dashboard.series.test.ts`):**
  - [ ] Filtra por `medidorId` y retorna puntos ascendentes.
  - [ ] Filtra por `instalacionId` + `recurso` en AND.
  - [ ] Respeta rango `fechaInicio..fechaFin` y `limite` (capado a más recientes).
  - [ ] `inicio > fin` → `RangoFechasInvalidoError` (400).
  - [ ] `instalacionId` ajena con scope → `InstalacionNoAsignadaError` (403); scope `[]` → `[]`.
- [ ] **Tests de controlador (mismo archivo):**
  - [ ] `GET /api/dashboard/series` → 200 con forma válida.
  - [ ] Query inválida (`limite=0`, uuid roto) → 400.
  - [ ] Scope ajeno → 403 (vía `request.user.allowedInstalacionIds`).
- [ ] **Frontend:**
  - [ ] `api.dashboard.getSeries(params)` operativo.
  - [ ] `public/js/charts.js` con `dibujarLinea/dibujarBarras/dibujarDona` nativos, empty-states y `data-testid`.
  - [ ] `#/dashboard` muestra filtros + 3 canvas: `chartEvolucionMedidor`, `chartConsumoInstalacion`, `chartDistribucionRecurso`; responsive sin overflow a 320px.
  - [ ] E2E `e2e/dashboard-graficos.spec.ts` en verde (admin ve canvas, filtrar no rompe).
- [ ] **Quality Gate:** `./scripts/verify.sh` salida 0 (typecheck + lint + vitest).
