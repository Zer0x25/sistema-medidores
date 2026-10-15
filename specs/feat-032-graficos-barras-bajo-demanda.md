# feat-032 — Consumo en barras y detalle bajo demanda

- 2026-10-15. Autorizado por solicitud del usuario: barras, contenido acotado y carga/sincronización bajo demanda. Sustituye la carga masiva de fix-030 en la UI, conservando sus contratos públicos existentes.
- ADR 0001, 0002, 0013, 0014, 0015 y diseño móvil: dominio en servidor, cliente presentacional, RBAC territorial, sin dependencias ni cambios en datos/ADR/core.

## Comportamiento verificable

- Inicio: `/dashboard/graficos?vista=resumen` retorna agregados y catálogo de medidores, sin series históricas. Repositorio específico limita la transferencia desde SQLite a apertura/cierre y primeras evidencias de incompatibilidad por equipo; conserva exactamente los totales, factores y topología histórica del motor existente.
- Un medidor activo por gráfico temporal, barras por intervalo real, 30 puntos como máximo por página. Endpoint privado `/dashboard/intervalos` con `medidorId`, fechas, `pagina` y `tamanio` (default 30, máximo 60), orden reciente primero, total y páginas. SQLite aplica `skip/take` y obtiene una sola referencia anterior adicional, fuera del filtro cuando corresponda. No descarga el histórico completo.
- Primera lectura null, cero confirmado visible; factores y decrementos mantienen estados del motor. Scope invisible devuelve página vacía sin fuga; instalación ajena 403; queries/rangos inválidos 400.
- Carga de intervalos al entrar el gráfico en viewport o interactuar con sus controles; cambiar medidor/página/fechas invalida datos previos y descarta respuestas tardías. Refrescar actualiza explícitamente, sin polling; redimensionar solo redibuja. Las peticiones duplicadas de una misma consulta en curso se comparten y las obsoletas se cancelan.
- Detalle cerrado inicialmente sin filas; abrir construye exclusivamente la página actual. Panel con alto máximo y scroll interno, tabla semántica/data-label y navegación por páginas; al cerrar elimina filas. No acumula páginas ni reconstruye tablas durante resize. Resumen de sedes también acotado/paginado.
- Barras temporales con unidad, intervalo real, número de página y estados de carga/vacío/error/reintentar. Mantener IDs/testids existentes. Filtros por recurso/unidad/sede coherentes; selector de equipo solo controla su evolución. Barras/dona de sedes conservan totales sin doble conteo y unidades separadas.
- Verificación real con demo de 2 meses sin mutarla; controles >=44px, cero overflow 320/375/425/768/1024 y panel de detalle acotado.

## Archivos editables autorizados

- `specs/feat-032-graficos-barras-bajo-demanda.md`
- `STATE.md`
- `src/modules/dashboard/dashboard.schema.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.repository.ts`
- `src/modules/dashboard/dashboard.controller.ts`
- `tests/modules/dashboard/dashboard.series.test.ts`
- `tests/modules/dashboard/dashboard.demanda.test.ts`
- `public/js/api.js`
- `public/js/charts.js`
- `public/js/dashboard-charts.js`
- `public/app.js`
- `public/index.html`
- `public/app.css`
- `public/sw.js`
- `e2e/dashboard-graficos.spec.ts`

## Cierre

- [x] Fase roja/verde: resumen compacto equivalente, página/referencia/count correctos, límites SQL, estados y aislamiento.
- [x] E2E de barras, payload/DOM acotados, detalle diferido, páginas sin acumulación, cambio de filtros, cancelación/obsoletos, resize sin tráfico, estados y móvil.
- [x] Gate salida 0, build y test:contract aislados; revisión visual desktop/móvil con historia real y sin modificar la DB demo del usuario.
