# Estado del Proyecto: Medidores (STATE.md)

Este archivo actúa como **memoria persistente y tablero de control** para humanos y agentes de software. Cada agente debe consultar este archivo al inicio de su sesión y actualizarlo al completar hitos o tareas.

---

## 🧭 Fase Actual: Gráficos de Barras Bajo Demanda (feat-032)

- **Proyecto:** `Medidores`
- **Estado:** Estable. Remarcadores con padre opcional, múltiples hijos y niveles, vínculos con vigencia y auditoría transaccional, consumo entre lecturas visible en Modo Terreno, balance por sectores en Reportes y totales por raíces sin doble conteo en Dashboard/CSV/facturas.
- **Spec Activo:** `specs/feat-032-graficos-barras-bajo-demanda.md`.
- **Última verificación de Quality Gate:** `./scripts/verify.sh` salida 0, 355/355 Vitest, typecheck y lint sin errores; build, 4/4 Playwright de gráficos y test:contract correctos sobre almacenamiento aislado. Revisión visual adicional de la demo real en 3002 sin mutar sus datos.

## Gráficos de barras y detalle bajo demanda: completado

- **Fecha:** 2026-10-15. Solicitud explícita: barras, contenido acotado y carga eficiente.
- La UI usa `GET /api/dashboard/graficos?vista=resumen`, sin series; el adaptador SQLite materializa como máximo cuatro referencias por equipo, conservando evidencia de factores incompatibles/decrementos y los mismos totales de raíces. `/graficos` completo y `/series` conservan compatibilidad.
- `GET /api/dashboard/intervalos`: un medidor, 30 registros por página (máximo API 60), orden reciente primero, count/skip/take y una referencia anterior fuera de la página/filtro. RBAC y territorio fail-closed.
- Barras temporales de un equipo, consulta al visualizar el panel, paginación y actualización explícita. AbortController para consultas obsoletas, deduplicación en curso y protección contra respuestas tardías. Resize solo redibuja.
- Nuevo módulo presentacional `public/js/dashboard-charts.js`; detalle sin filas al estar cerrado, máximo 30 al abrir, scroll interno acotado y filas reemplazadas por página. Sedes paginadas de 12 en 12; magnitudes separadas, estados/reintento y PWA actualizada.
- Medición en la demo de 2.196 lecturas: respuesta anterior **2.168.147 bytes**, resumen **9.917 bytes** y página de 30 **32.664 bytes**; aproximadamente **98% menos transferencia de gráficos** al cargar resumen y un equipo. No representa una medición del tráfico total de la aplicación.
- Evidencia temporal: `/tmp/dashboard-demanda-{roja.log,verde.log,gate.log,e2e.log,build.log,contract.log,payload.json}`, capturas desktop/móvil reales en `/tmp/dashboard-demanda-{desktop,mobile}-real.png`. 4/4 E2E verifican carga por visibilidad, filas/payload acotados, navegación, reintento, deduplicación, obsoletos y zero overflow 320/375/425/768/1024. Base demo del usuario conservada.

## Demo histórica local: activada

- **Fecha:** 2026-10-15. Reinicio local y carga histórica autorizados explícitamente por el usuario.
- Nueva base local activa: `prisma/prisma/demo-historico-20261015.db`, seleccionada en `.env` ignorado; puerto **3002**. La base anterior `prisma/prisma/dev.db` se conserva y además tiene respaldo consistente verificado en `backups/pre-seed-historico-2026-10-15T10-16-43-412Z.db` (212 medidores y 295 lecturas previas).
- **Datos:** 3 instalaciones, 36 medidores y 2.196 lecturas. Agua/M3, Luz/KWH y Gas/M3; por sede/recurso un general, dos hijos y un nieto, con 27 vínculos históricos auditados. **61 lecturas por equipo y 60 intervalos**, desde `2026-08-16T09:00:00.000Z` hasta `2026-10-15T09:00:00.000Z`.
- Variación semanal, tendencia y picos controlados; factores snapshot 1, lectura de apertura, cronología uniforme y fechas de alta/vínculo anteriores al histórico. Balances calculados con saldos positivos y distribución comparable entre sedes.
- Usuarios `admin@medidores.cl`, `supervisor@medidores.cl`, `operador@medidores.cl`, clave demo `demo1234`. Operador con tres sedes y supervisor con Planta Norte.
- `scripts/seed-historico.ts` siembra únicamente bases vacías en development/test; no elimina ni altera datos existentes ni auditorías. Ejecutar tras aprovisionar el esquema mediante `DATABASE_URL=file:/ruta/base-nueva.db npx tsx scripts/seed-historico.ts`.
- Validación: 351/351 tests; `/readyz`, login, KPIs y `/dashboard/graficos` correctos en 3002 tras reiniciar el watcher existente. Chromium comprobó 60 consumos por serie, resumen de intervalos y zero overflow en 320/375/425/768/1024 px. Evidencia temporal en `/tmp/seed-historico-{gate.log,qa.json,resultado.json}` y `/tmp/seed-historico-graficos-activos.png`. Servicio ajeno en 3000 conservado.

## Gráficos de consumo: corrección completada

- **Fecha:** 2026-10-15. Solicitud: visualizar consumo en lugar de lecturas acumuladas.
- Nuevo contrato `GET /api/dashboard/graficos`; `/series` conserva su contrato de lecturas. Línea con deltas consecutivos calculados en backend, sin reaplicar factor; datos desconocidos como null y huecos en la línea, cero confirmado visible.
- Barras y dona consumen agregados del período filtrado: raíces históricas sin doble conteo, consumo propio al seleccionar un equipo, fechas reales y cobertura. Selector por recurso/unidad; dona por participación de consumo entre sedes, únicamente con períodos comparables.
- Todos los filtros afectan a los gráficos; día final local completo, descarte de respuestas antiguas, resumen accesible de cada intervalo, redibujo al redimensionar y shell PWA actualizado. Los modos NIVEL/INSTANTANEO mantienen sus funciones existentes en Reportes.
- Evidencia temporal: `/tmp/graficos-consumo-roja.log`, `/tmp/graficos-ui-roja.log`, `/tmp/graficos-consumo-gate.log`, `/tmp/graficos-consumo-e2e.log`, `/tmp/graficos-consumo-contract.log`, `/tmp/graficos-consumo-mobile.png`. Navegador verifica datos reales entregados a los tres renderers, huecos/cero y ausencia de overflow a 320/375/425/768/1024 px. SQLite de pruebas aislado en `/tmp`, sin cambios de datos locales.

---

## Remarcadores y balances: implementación completada

- **Fecha:** 2026-10-15.
- **Entrega A:** motor compartido de consumo temporal, apertura anterior o igual al inicio, fechas reales/cobertura, continuidad de factor y estados null explícitos; tarjetas de Modo Terreno con lectura anterior/actual y delta confirmado.
- **Entrega B:** alta con padre y cambio/desvinculación en Parque; historial de vigencias, auditoría y proyección actual en una transacción; rechazo de ciclos, padres incompatibles y accesos territoriales ajenos. Concurrencia A→B/B→A probada en SQLite real, con rollback de auditoría.
- **Entrega C:** balance por hijos directos y topología histórica, saldos negativos visibles, períodos desalineados no comparables, sumas por raíces/recurso/unidad y facturas pendientes cuando faltan referencias. Vista móvil verificada sin overflow a 320/375/425/768/1024 px.
- **Base local de desarrollo:** esquema aditivo aplicado con respaldo previo `backups/pre-remarcadores-20261015.db`. Antes/después: 212 medidores y 295 lecturas; los 212 padres inicialmente nulos. Prueba adicional de adopción de una base del esquema anterior conservó IDs, lecturas y factores.
- **Prueba de adopción:** esquema previo fijado en `tests/fixtures/feat-028-schema.prisma`; no depende de `HEAD` ni del historial Git disponible en CI.
- **Gate:** excluir el repositorio hijo del runner padre y dejar de ocultar errores de aprovisionamiento Prisma; inicializar únicamente archivos SQLite ausentes. El gate final pasó desde un archivo temporal inexistente.
- **Evidencia:** `/tmp/remarcadores-roja.log` (fase roja inicial), `/tmp/remarcadores-e2e-roja.log` (UI roja), `/tmp/remarcadores-gate-entrega.log` (339/339), `/tmp/remarcadores-contract.log` (contratos). E2E: suites `remarcadores-balances`, `reportes-conciliacion`, `lecturas-terreno` y `dashboard-graficos`, 9/9 con salida 0; captura del balance móvil en `/tmp/remarcadores-balance-mobile.png`. Los archivos en `/tmp` son evidencia temporal.
- **Límites de esta entrega:** balance jerárquico ACUMULATIVO con recurso/unidad idénticos y timestamps de apertura/cierre alineados, sin interpolación; historial con factores desconocidos se marca no comparable. NIVEL/INSTANTANEO conservan su cálculo anterior. Sin sincronización del repositorio Edge. Commit y push del repositorio padre autorizados explícitamente por el usuario el 2026-10-15.

## 📋 Registro de Hitos

- [x] **Hito 15.14: Gráficos de barras y consultas bajo demanda (Completado: 2026-10-15)**
  - Spec `feat-032`, SQL de resumen compacto y paginación de intervalos, barras por equipo y detalle diferido/acotado.
  - Gate 355/355, 4/4 Playwright, build y contrato correctos; revisión visual desktop/móvil y medición de transferencia con la demo real.

- [x] **Hito 15.13: Demo histórica local de dos meses (Completado: 2026-10-15)**
  - Spec `chore-031`, semilla reproducible sobre base nueva, respaldo consistente y activación local verificable sin eliminar la base original.
  - 3 sedes, 36 equipos, 2.196 lecturas y 60 intervalos por equipo; jerarquías, factores y períodos comparables. Gate 351/351, API y navegador correctos.

- [x] **Hito 15.12: Gráficos de consumo entre lecturas (Completado: 2026-10-15)**
  - Spec `fix-030`, fases roja/verde, contratos Zod, 348/348 Vitest y 3/3 Playwright de gráficos; typecheck, lint, build y test:contract correctos.
  - Línea de consumos, barras/dona con filtros y períodos reales, magnitudes separadas, resumen accesible y adaptación móvil.

- [x] **Hito 15.11: Remarcadores Jerárquicos y Balances de Consumo (Completado: 2026-10-15)**
  - Spec `feat-029`; contratos Zod, pruebas rojas/verde, Prisma regenerado y sincronización aditiva con respaldo local.
  - Jerarquía persistida y auditada, consumo temporal visible, balances históricos, total sin doble conteo, CSV/conciliación y adaptación móvil.
  - Quality Gate salida 0 (339/339), build y contrato correctos; 9/9 Playwright seleccionados. Sin cambios en ADR ni dependencias.

- [x] **Hito 15.10: Dashboard con Gráficos por Medidor e Instalación (Completado: 2026-10-13)**
  - Spec `feat-028` bajo SDD + Agentic TDD (Fase Roja 9/9 en fallo, Fase Verde 9/9).
  - Backend: `DashboardSerieQuerySchema` + `obtenerSeries()` (filtros AND, orden asc, capado `limite`, `RANGO_FECHAS_INVALIDO` 400, `INSTALACION_NO_ASIGNADA` 403 fail-closed) + `GET /api/dashboard/series` (400 validación, 401 sin auth, 403 OPERADOR por matriz existente).
  - Frontend: `api.dashboard.getSeries()`, `public/js/charts.js` (línea/barras/dona en Canvas 2D nativo, sin npm install), sección `#seccionGraficos` con 5 filtros y 3 canvas con `data-testid` + ARIA, CSS `.charts-grid` responsive sin overflow (320/375/768 verificados).
  - Verificación: `./scripts/verify.sh` salida 0 (347/347 Vitest) + 2/2 Playwright (`dashboard-graficos`) + roundtrip lectura→serie + 403 territorial en vivo.

- [x] **Hito 15.9: Demo solo en Dev + Healthcheck Real (Completado: 2026-10-07)**
  - Spec `feat-027` bajo SDD + Agentic TDD (Fase Roja 1/4, Fase Verde completa).
  - Backend: `isDemoSeedEnabled(env)` + guardia `403 DEMO_SEED_DISABLED` en `POST /api/demo/seed` para staging/production; `GET /readyz` como base pública del healthcheck.
  - Frontend: `#btnSeedDemo`/`#btnSeedDemoMobile` fail-closed (`display:none`, solo visibles con `devRoleSwitcher:true`) + guardia en `seedDemoData()`; `SyncManager.verificarSaludBackend()` contra `/readyz` (timeout 5s, polling 30s, `cache:no-store`, clic en badge re-verifica) con estados `En línea` / `Modo Offline` / `Sin servidor` / `Servidor degradado`; `api.salud.verificarReadyz()` + CSS `.degraded`; SW con bypass de `/readyz`+`/healthz` y `CACHE_NAME v3` (sin esto el SW servía `/readyz` cacheado y el badge quedaba fijo en "En línea").
  - Quality Gate: `./scripts/verify.sh` salida 0 (338/338 Vitest) + 10/10 Playwright (`pwa-offline-resiliencia` 3/3 con nuevo test `Sin servidor` + `login-pantalla-real`) sin regresiones.

- [x] **Hito 15.8: Gestión de Tipos con Bloqueo por Uso y Reasignación (Completado: 2026-10-07)**
  - Spec `feat-026` bajo SDD + Agentic TDD (Fase Roja 3/3, Fase Verde completa).
  - Dominio: `editarTipoMedidor`/`archivarTipo`/`restaurarTipo`/`eliminarTipoFisico` con `countMedidoresByTipo`; en uso → `TIPO_MEDIDOR_EN_USO` (409) o `TIPO_MEDIDOR_CON_MEDIDORES_NO_ELIMINABLE` (422); `editarMedidor` acepta `tipoMedidorId` (reasignación validada, auditada en `MEDIDOR_EDITADO`); auditoría `TIPO_MEDIDOR_*`; RBAC tipos solo ADMIN; `GET /tipos-medidor?estado=`.
  - Frontend: pestaña «Tipos de Medidor» en `#/parque` con tabla y acciones, modal `modalEditarTipo`, select de reasignación en `modalEditarMedidor`.
  - Quality Gate: `./scripts/verify.sh` salida 0 (334/334 Vitest) + 61/61 Playwright (nueva suite `tipos-gestion` 2/2) sin regresiones.

- [x] **Hito 15.7: Alineación a Estándar OBIS/Origen/Factor por Activo (Completado: 2026-10-07)**
  - Spec `feat-025` bajo SDD + Agentic TDD (Fase Roja con fallos en externo-duplicado y origen, Fase Verde completa).
  - Dominio: `Medidor.codigoExterno` único + `factorInstalacion` override (edición libre con snapshot en auditoría, error `MEDIDOR_CODIGO_EXTERNO_DUPLICADO` 409); `Lectura.origen` (`MANUAL` default, `AJUSTE`, `IMPORTADA`, propagado en batch-sync); factor efectivo instalación ?? tipo ?? 1 en `server.ts`.
  - Frontend: alta/edición de medidor con externos + factor, bitácora con badge `RECARGA` (feat-024).
  - Quality Gate: `./scripts/verify.sh` salida 0 (322/322 Vitest) + 59/59 Playwright (nueva suite `estandar-alineacion` 2/2) sin regresiones.

- [x] **Hito 15.6: Tipos de Medición con Multiplicador, Nivel con Cota y Recargas de Tanque (Completado: 2026-10-07)**
  - Spec `feat-024` implementado bajo SDD + Agentic TDD (Fase Roja 3/3 fallos en factor/capacidad/validación, Fase Verde 72/72 en suites de dominio).
  - Dominio: `TipoMedidor.multiplicador` (default 1) + `capacidadMaxima` nullable; `Lectura.valor` real + `valorBruto` + `multiplicadorAplicado`, cota `NIVEL_FUERA_DE_RANGO` (422); `RegistroMantenimiento.RECARGA_TANQUE` con `volumenRecargado` + `nivelPosterior` y errores `VOLUMEN_RECARGA_REQUERIDO` (400), `NIVEL_POSTERIOR_REQUERIDO` (400), `RECARGA_SOLO_NIVEL` (422).
  - Consumos: `ACUMULATIVO` max-min, `NIVEL` bajada+recargas, `INSTANTANEO` promedio (reportes + dashboard con recargas); alertas `SALTO_CONSUMO`/`FUGA_PROBABLE` solo en acumulativos.
  - Frontend: modal tipo con factor + capacidad, modal mantenimiento con sección recarga + badge `RECARGA`, seed con diésel 5000 L.
  - Quality Gate: `./scripts/verify.sh` salida 0 (318/318 Vitest) + 57/57 Playwright (nueva suite `tipos-medicion` 2/2) sin regresiones.

- [x] **Hito 15.5: Módulo Parque Independiente y Dashboard Informativo (Completado: 2026-10-07)**
  - Spec `feat-023` implementado íntegramente bajo SDD + Agentic TDD (Fase Roja con 6/6 fallos iniciales, Fase Verde con 6/6 en verde).
  - Frontend Aurora UI:
    - `public/index.html`: `viewAdmin` reducida a KPIs + desatendidos + consumos + actividad reciente (botones de alta eliminados, `seccionGestionParque` extraída). Nueva `viewParque` (`#/parque`, `nav-parque`/`mobile-nav-parque`) con header propio y card de gestión trasladada íntegra (IDs/testids preservados, unicidad garantizada).
    - `public/app.js`: `ROUTE_HASH_MAP` + `parseRouteKeyFromHash` con `parque`, rama `parque` en `switchRole`, `aplicarPermisosUI` con tabs parque (OPERADOR oculto, SUPERVISOR sin sedes/tipos), `cargarDashboard` desacoplado de `cargarParqueAdmin`, mutaciones refrescando parque + dashboard.
  - E2E: nueva suite `e2e/parque-modulo.spec.ts` (6/6 pasando) + actualización de `catalogo-aprovisionamiento`, `explorabilidad-agentes`, `login-rbac` y `responsive-mobile` a navegación por parque con selectores acotados `#viewParque`.
  - Quality Gate: `./scripts/verify.sh` salida 0 (306/306 Vitest) + 55/55 Playwright E2E (49 previas + 6 nuevas) sin regresiones.
- [x] **Hito 15.4: Ciclo de Vida Metrológico, Archivado (Soft Delete), Edición y Ventana de Gracia / Marcha Blanca 30 Días (Completado: 2026-10-06)**
  - Spec `feat-022` implementado íntegramente bajo Agentic TDD y Architecture Governance.
  - Base de Datos y Esquemas: campo `codigo` añadido a `Instalacion` en Prisma schema, DTOs de edición y respuesta Zod con cálculo dinámico de `enPeriodoGracia` y `diasRestantesGracia`.
  - Dominio e Invariantes:
    - Edición libre de nombres, descripciones y ubicaciones sin alterar relaciones relacionales fundamentadas en IDs UUID surrogates inmutables.
    - Edición de `codigo` permitida exclusivamente durante los primeros 30 días (`enPeriodoGracia`); rechazo con `PeriodoGraciaExpiradoError` (HTTP 422) tras superar los 30 días.
    - Soft delete (archivado/restauración) implementado para instalaciones y medidores. Medidores archivados (`activo = false`) rechazan automáticamente nuevas lecturas (`MedidorInactivoError: 422`). Instalaciones con medidores activos impiden su archivado (`InstalacionTieneMedidoresActivosError: 422`).
    - Eliminación física (Hard Delete) permitida únicamente al rol `ADMIN` dentro de la ventana de gracia (≤ 30 días) y con 0 lecturas (para medidores) o 0 medidores (para instalaciones); bloqueada con `EliminacionFisicaProhibidaError: 422` tras 30 días.
    - Registro inmutable y tipado en `AuditoriaEvento` de snapshots y acciones (`INSTALACION_EDITADA`, `INSTALACION_ARCHIVADA`, `INSTALACION_RESTAURADA`, `INSTALACION_ELIMINADA_GRACIA`, `MEDIDOR_EDITADO`, `MEDIDOR_ARCHIVADO`, `MEDIDOR_RESTAURADO`, `MEDIDOR_ELIMINADO_GRACIA`).
  - Filtrado y Endpoints: parámetros `estado=activas|archivadas|todas` y `estado=activos|archivados|todos` en endpoints GET de instalaciones y medidores con permisos diferenciados por rol.
  - Frontend Aurora UI:
    - `public/js/api.js`: métodos `update`, `archivar`, `restaurar`, `delete` y soporte de `estado`.
    - `public/index.html`: componente `seccionGestionParque` en Dashboard de Administrador con selector de entidad (Sedes vs Medidores), selector de estado (Activos / Archivados / Todos), modales dedicados `modalEditarInstalacion` y `modalEditarMedidor` con visualización dinámica de días restantes de gracia y bloqueo inmutable.
    - `public/js/components.js` y `public/app.js`: filas de presentación `createInstalacionRow` y `createMedidorRow` con badges semánticos y handlers de confirmación.
  - Quality Gate: `./scripts/verify.sh` superado con salida 0 (306/306 tests unitarios/integración en Vitest al 100%, 0 regresiones).

- [x] **Hito 15.3: Explorabilidad de Rutas, Localización DOM y Observabilidad para Agentes de Navegador (Completado: 2026-10-05)**
  - ADR 0015 formalizado e implementado en frontend, backend y suites de prueba.
  - Hash Router cliente (`/#/[modulo]`) con sincronización bidireccional de historial (`window.location.hash`, `hashchange`), navegación adelante/atrás y persistencia determinista al recargar (`F5`).
  - Redirección y persistencia de ruta objetivo post-autenticación (`redirectRoute` / `authRedirectHash`).
  - Taxonomía estricta de localizadores: paneles con `data-testid="view-[modulo]"`, `role="region"`, `aria-label`; controles de navegación desktop y móvil con `data-testid="nav-[modulo]"` y `data-testid="mobile-nav-[modulo]"`; 14 modales instrumentados con ciclo de vida `data-state="open|closed"` y `aria-hidden`.
  - Bus de observabilidad y diagnóstico global `window.__DIAGNOSTICS__` con buffer circular de errores (máx 50), enriquecido con `activeRoute`, `currentUser`, captura de errores no controlados (`window.onerror`, `unhandledrejection`) y logs estructurados `[API FAIL]` en `ApiClient.request`.
  - Contrato de datos de prueba repetibles: `POST /api/demo/seed` entrega payload estructurado con `seedData` (instalaciones, medidores, usuarios) sin acumulación de estado.
  - Suite E2E dedicada `e2e/explorabilidad-agentes.spec.ts` (5/5 tests pasando) y suite general E2E (49/49 tests pasando al 100%).
  - Quality Gate `./scripts/verify.sh` superado con código de salida 0 (263/263 tests unitarios/integración en Vitest).

- [x] **Hito 15.2: Simetría de Contrato y Prevención de Leaks UI (Completado: 2026-10-05)**
  - ADR 0014 implementado en backend y frontend.
  - Corrección de fugas visuales: erradicación de `(undefined)` y `Invalid Date` en selector de instalaciones, tarjetas de medidores y selects de tipos.
  - Simetría bidireccional de alias en Fastify/Prisma (`ubicacion`/`direccion`, `unidad`/`unidadMedida`, `fechaLectura`/`timestamp`/`fecha`).
  - Helper universal `parseSafeDate` en frontend para parsing tolerante ante timestamps SQLite y ISO con fallback defensivo.
  - Script automatizado de verificación de contrato `scripts/test-contract-symmetry.mjs` y comando `npm run test:contract` con aserción estricta de cero leaks (`undefined`, `null`, `NaN`, `Invalid Date`, `[object Object]`).
  - 234/234 pruebas en Vitest pasando exitosamente (100%).

- [x] **Hito 15.1: Blindaje Perimetral API Zero-Trust y Matriz RBAC Fail-Closed (Completado: 2026-10-04)**
  - ADR 0013 y Spec `feat-019` implementados bajo Agentic TDD.
  - Blindaje perimetral absoluto en hook `preHandler`: toda ruta privada bajo `/api/*` exige cabecera `Authorization: Bearer <token>` válida (HTTP 401).
  - Allow-list explícita para rutas públicas (`/healthz`, `/readyz`, `/api/health`, `/api/config`, `/api/auth/login`, `/api/auth/register`, `/api/demo/seed`).
  - Preservación semántica de códigos HTTP 404: rutas inexistentes bajo `/api/` retornan 404 Not Found (tanto con como sin `@fastify/static` activo), evitando enmascaramiento falso como 401.
  - Matriz RBAC exhaustiva: `OPERADOR` restringido a Modo Terreno (denegado 403 en `/api/dashboard`, `/api/reportes`, `/api/alertas`, `/api/mantenimiento` y creación de entidades); `SUPERVISOR` restringido a sedes asignadas; `ADMIN` con acceso total.
  - Suite de 27 pruebas dedicadas en `tests/server.rbac-perimeter.test.ts` pasando al 100%. Quality Gate `./scripts/verify.sh` superado con código de salida 0 (233 tests unitarios/integración + 44 tests Playwright E2E). Contenedor Staging certificado en puerto 3001.

- [x] **Hito -1: Blueprint Semilla Inicial**
  - Estructura agnóstica de gobernanza creada (`AGENTS.md`, `.agents/`, `docs/adr/`, `specs/templates/`, `scripts/`).
  - Barrera determinista `scripts/verify.sh` configurada.
- [x] **Hito 0: Constitución del Proyecto (Completado: 2026-10-03)**
  - Entrevista estructurada sobre Dominio, Invariantes, Stack y Restricciones.
  - Compilación inmutable de `docs/adr/0001-arquitectura-base.md`.
  - Plantilla de especificación de dominio `specs/templates/feature.md`.
  - Andamiaje funcional con TypeScript, Fastify, Prisma, Zod, Vitest y ESLint.
  - Quality Gate verificado con salida exitosa 0.
- [x] **Hito 1: Desarrollo de Features de Dominio (Completado: 2026-10-03)**
  - [x] `specs/feat-001-instalaciones-y-usuarios.md` (Completado: Módulo de Instalaciones y Asignaciones)
  - [x] `specs/feat-002-catalogo-medidores.md` (Completado: Catálogo de Tipos de Medidores y Medidores)
  - [x] `specs/feat-003-registro-lecturas.md` (Completado: Ingesta de Lecturas con Invariantes Duras)
  - [x] `specs/feat-004-dashboard-admin.md` (Completado: Métricas, KPIs y Alertas de Administración)
- [x] **Hito 2: Arquitectura Frontend & Design System (Completado: 2026-10-03)**
  - Aprobación inmutable de `docs/adr/0002-frontend-design-system-y-componentes.md`.
  - Design System Aurora implementado con tokens CSS semánticos y soporte nativo Modo Claro / Oscuro.
  - Desacoplamiento de lógica de negocio: `ApiClient` centralizado, `ModalManager`, `ToastManager` y factoría de componentes reutilizables (`createMeterCard`, etc.).
- [x] **Hito 3: Autenticación JWT y Control de Acceso RBAC (Completado: 2026-10-03)**
  - `specs/feat-005-autenticacion-rbac.md` implementado.
  - 3 Roles jerárquicos: `ADMIN` (acceso global), `SUPERVISOR` (limitado a sedes asignadas, crea medidores en sedes asignadas, no crea instalaciones), `OPERADOR` (captura en terreno).
  - Criptografía nativa con `node:crypto` (scrypt + JWT HS256), guardias preHandler de Fastify y 74/74 tests superados.
- [x] **Hito 4: Gestión Integral de Usuarios y Contraseñas (Completado: 2026-10-03)**
  - `specs/feat-006-gestion-usuarios-y-password.md` implementado bajo Agentic TDD.
  - Auto-servicio de cambio de contraseña (`POST /api/auth/cambiar-password`) con validación de contraseña actual y error tipado `PasswordActualInvalidaError`.
  - Directorio administrativo de usuarios (`GET /api/usuarios`) con asignaciones de instalaciones.
  - Modificación de usuario (`PATCH /api/usuarios/:id`) con sincronización transaccional de instalaciones asignadas.
  - Restablecimiento administrativo de credenciales (`POST /api/usuarios/:id/reset-password`).
  - Interfaz gráfica integrada con Aurora Design System.
  - Suite de pruebas expandida: 88/88 tests pasando (100%), Quality Gate 0.
- [x] **Hito 5: Reportes, Alertas Automáticas y Mantenimiento Metrológico (Completado: 2026-10-03)**
  - `specs/feat-007-reportes-y-exportacion.md`: Consumos netos consolidados, descarga CSV con cabeceras `Content-Disposition`, auditoría y conciliación contra facturas de servicios básicos con detección de desvío (≤ 5% `CONCILIADO`, > 5% `DISCREPANCIA`).
  - `specs/feat-008-alertas-y-anomalias.md`: Motor de detección temprana en vivo (`SIN_REPORTE > 48h`, `SALTO_CONSUMO > 50%`, `FUGA_PROBABLE`), ciclo de vida de incidentes (`ABIERTO`, `EN_REVISION`, `RESUELTO`) y métricas de severidad.
  - `specs/feat-009-mantenimiento-y-calibracion.md`: Bitácora técnica metrológica, trazabilidad de precintos de seguridad numerados, control de calibraciones periódicas y bajas o reemplazos técnicos con validación de lecturas de retiro.
  - Interfaz gráfica con Aurora Design System: Nuevas pestañas de Reportes & Facturas, Alertas & Incidentes, y Mantenimiento & Calibración.
  - Suite de pruebas expandida a 19 archivos y 125 pruebas pasando exitosamente (100%), Quality Gate 0.
- [x] **Hito 6: Empaquetamiento Docker, Staging & Pipeline CI/CD (Completado: 2026-10-03)**
  - `docs/adr/0003-empaquetamiento-docker-y-pipeline-cicd.md` (Compilado y extendido con estrategia multi-entorno Dev -> Staging -> Prod).
  - `specs/infra-001-docker-y-cicd.md` (Completado: Dockerfile multi-stage, docker-compose productivo y CI GitHub Actions).
  - `specs/infra-002-entorno-staging.md` (Completado: Entorno Staging, `docker-compose.staging.yml`, validación Zod `NODE_ENV=staging`, `.env.staging.example` y scripts).
  - Persistencia y aislamiento: volúmenes `medidores_data` y `medidores_staging_data` independientes.
  - Puertos: Producción en 3000, Staging en 3001 (permitiendo convivencia segura en el mismo servidor).
  - Quality Gate verificado con salida 0 (126/126 tests pasando, 100%).
- [x] **Hito 7: Modo Offline y PWA para Captura en Terreno (Completado: 2026-10-03)**
  - [x] `specs/feat-010-pwa-offline-sync.md` (Completado: Arquitectura PWA y Offline-First).
  - [x] Manifest PWA (`manifest.webmanifest`), icono SVG y Service Worker (`sw.js`) para caching estático.
  - [x] Endpoint backend de sincronización en lote `POST /api/lecturas/batch-sync` con validación individual de invariantes.
  - [x] Cola offline local en cliente (`SyncManager`) con intercepción y persistencia de lecturas en `localStorage`.
  - [x] Indicadores de conectividad (Online/Offline) y botón de sincronización en Aurora UI.
  - [x] Auto-sincronización automática tras detección de evento `online`.
  - [x] Suite de pruebas expandida: 129/129 tests pasando (100%), Quality Gate 0.
- [x] **Hito 8: Seguridad & Observabilidad en Producción (Completado: 2026-10-03)**
  - `docs/adr/0004-seguridad-healthchecks-y-auditoria.md` formalizado.
  - `specs/feat-011-seguridad-healthchecks-auditoria.md` implementado bajo Agentic TDD.
  - Rate Limiting en autenticación (`POST /api/auth/login`) contra ataques de fuerza bruta (`@fastify/rate-limit`, máx 5 intentos/min, HTTP 429).
  - Endpoints de salud operativa: `/healthz` (liveness con uptime) y `/readyz` (readiness con ping activo a SQLite con 200 OK o 503).
  - Pista de Auditoría inmutable (Audit Log): modelo `AuditoriaEvento` y módulo `src/modules/auditoria/` para registrar eventos críticos (cambios de rol, bajas de medidores, rupturas de precintos y reset de contraseñas).
  - Consulta RBAC de auditoría (`GET /api/auditoria`) restringida exclusivamente a administradores.
  - Pestaña "Auditoría & Seguridad" en la interfaz Aurora UI con filtros por tipo de acción.
  - Probes en `Dockerfile`, `docker-compose.yml` y `docker-compose.staging.yml` actualizados a `/readyz`.
  - Suite de pruebas expandida: 143/143 tests pasando (100%), Quality Gate 0.
- [x] **Hito 9: Despacho de Notificaciones & Webhooks (Completado: 2026-10-03)**
  - `docs/adr/0005-integraciones-y-despacho-webhooks.md` formalizado.
  - `specs/feat-012-webhooks-notificaciones.md` implementado bajo Agentic TDD.
  - Modelos `WebhookEndpoint` y `WebhookEntrega` en Prisma con soporte multi-evento y firmas seguras HMAC-SHA256 (`X-Webhook-Signature`).
  - Despachador asíncrono, tolerante a fallos (`fail-safe`), con timeout estricto de 5000ms y concurrencia paralela (`Promise.allSettled`).
  - Instrumentación automática ante incidentes en vivo (`alerta.incidente_detectado`, `alerta.incidente_resuelto`).
  - Disparador preventivo de calibraciones periódicas (`POST /api/webhooks/check-calibraciones`).
  - Diagnóstico sintético inmediato (`POST /api/webhooks/:id/test` con ping).
  - Pestaña de administración y modal de historial de entregas en Aurora UI.
  - Suite de pruebas expandida: 170/170 tests pasando (100%), Quality Gate 0.
- [x] **Hito 9 Extendido: Observabilidad y Triggers de Webhooks ante Errores Críticos (Completado: 2026-10-03)**
  - `docs/adr/0006-observabilidad-logs-estructurados-y-triggers-webhooks.md` formalizado.
  - `specs/feat-013-logs-estructurados-y-error-webhooks.md` implementado bajo Agentic TDD.
  - Integración nativa de Pino en Fastify según `LOG_LEVEL` dinámico por entorno.
  - Correlación de solicitudes con `reqId`.
  - Manejador central de errores `app.setErrorHandler` con trigger de webhook `sistema.error_critico` ante fallos 5xx.
  - Aislamiento de errores 4xx para evitar fatiga de alertas.
  - Resiliencia y despacho fail-safe ante caídas del receptor de webhooks.
  - Suite de pruebas expandida: 174/174 tests pasando (100%), Quality Gate 0.

---

- [x] **Hito 10: Suite de Pruebas E2E Automatizadas con Playwright (Completado: 2026-10-03)**
  - Formalización inmutable de `docs/adr/0007-pruebas-e2e-playwright.md`.
  - Especificación `specs/test-001-e2e-playwright.md` implementada bajo Agentic TDD.
  - `@playwright/test` y Chromium headless configurados con auto-lanzamiento (`webServer`).
  - Cobertura de flujos de usuario completos:
    - Login y Control de Acceso RBAC (`e2e/login-rbac.spec.ts`).
    - Captura de lecturas en terreno e invariantes decrecientes (`e2e/lecturas-terreno.spec.ts`).
    - Detección en vivo y resolución de alertas operativas (`e2e/alertas-incidentes.spec.ts`).
    - Administración, ping sintético y bitácora de webhooks (`e2e/webhooks-administracion.spec.ts`).
  - Aislamiento respecto a Vitest en `vitest.config.ts`.
  - Pipeline de CI en `.github/workflows/verify.yml` actualizado con paso Playwright.
  - Quality Gate verificado: 174/174 tests Vitest pasando + 6/6 tests E2E Playwright pasando (100%).
- [x] **Hito 11: Notificaciones Push (Web Push API) y Alertas por Telegram (Completado: 2026-10-03)**
  - ADR 0008 compilado (`docs/adr/0008-notificaciones-push-y-alertas-multicanal.md`).
  - Spec cerrado `specs/feat-014-notificaciones-push-y-telegram.md`.
  - Despachador de Telegram Bot 100% nativo con formato HTML enriquecido, severidad y emojis semánticos.
  - Despachador de Web Push (W3C Push API / RFC 8292 VAPID) con integración en Service Worker (`public/sw.js`).
  - Modelos `SuscripcionPush` y `NotificacionHistorial` en Prisma con bitácora inmutable.
  - Despacho fail-safe asíncrono (`Promise.allSettled`, timeout 5000 ms) en detección de incidentes y errores 5xx.
  - Interfaz de usuario con activación de push en un clic, pruebas sintéticas y bitácora de entregas.
  - Quality Gate verificado: 187/187 tests Vitest pasando + 7/7 tests E2E Playwright pasando (100%).
- [x] **Hito 12: Endurecimiento Operacional, Concurrencia y Resiliencia de Producción (Completado: 2026-10-04)**
  - Formalización inmutable de `docs/adr/0009-endurecimiento-operacional-concurrencia-y-resiliencia.md`.
  - Especificación `specs/feat-015-endurecimiento-y-resiliencia-produccion.md` implementada bajo Agentic TDD.
  - SQLite WAL mode, busy timeout (5000ms), integridad referencial forzada (`PRAGMA foreign_keys = ON;`) y `synchronous = NORMAL`.
  - Endpoint seguro de hot backup (`POST /api/admin/backup`) mediante `VACUUM INTO` con registro de auditoría (`AuditoriaEvento`, acción `BACKUP_SISTEMA`).
  - Parada ordenada (Graceful Shutdown) ante `SIGTERM`/`SIGINT` con drenaje de peticiones y desconexión segura de Prisma.
  - Cabeceras de seguridad HTTP con `@fastify/helmet` y CSP adaptada para la PWA (`scriptSrcAttr: ["'unsafe-inline'"]`).
  - Validación Zod estricta en query parameters (`/api/lecturas/recientes`).
  - Frontend resiliente: retroceso exponencial con jitter aleatorio (±15%) en `SyncManager`, captura global de expiración de sesión (401) en `ApiClient` con evento `medidores:session-expired`, y estados de error con recuperación interactiva (`renderErrorState`).
  - Suite de pruebas de concurrencia y validación completa del Quality Gate (196/196 Vitest pasando + 7/7 E2E Playwright pasando, 100%).

- [x] **Hito 13: Adaptabilidad Responsiva Mobile-First y Usabilidad en Terreno (Completado: 2026-10-04)**
  - Formalización inmutable de ADR 0010 (`docs/adr/0010-diseno-responsivo-y-adaptabilidad-movil.md`).
  - Especificación `specs/feat-016-adaptabilidad-movil-responsive.md` implementada bajo Agentic TDD.
  - Menú hamburguesa accesible / Drawer móvil en cabecera para los 9 módulos, simulación RBAC y perfil de usuario.
  - Escala progresiva de breakpoints: 320px (XS / iPhone SE 1st Gen), 375px (SM / iPhone Estándar), 425px (MD / Phablet), 768px (LG / Tablet), 1024px+ (XL / Desktop).
  - Eliminación de overflow horizontal (`zero horizontal overflow`) en toda la aplicación (`max-width: 100%`, `overflow-x: hidden`).
  - Touch targets ergonómicos mínimos (>= 44px) y prevención de auto-zoom indeseado en iOS Safari (`font-size: 16px` en inputs).
  - Modales adaptados a viewport dinámico (`dvh`) con cabecera y pie `position: sticky` y scroll interno.
  - Suite de pruebas E2E móvil en Playwright (`e2e/responsive-mobile.spec.ts`) con 5 escenarios en múltiples viewports.
  - Quality Gate verificado con código de salida 0 (206/206 tests Vitest + 24/24 tests Playwright E2E pasando, 100%).

- [x] **Hito 13.1: Fichas Adaptativas Móviles (Stacked Cards) para Listados de Datos (Completado: 2026-10-04)**
  - Formalización inmutable de ADR 0011 (`docs/adr/0011-fichas-moviles-tablas-responsive.md`).
  - Especificación `specs/feat-017-fichas-moviles-tablas-responsive.md` implementada bajo Agentic TDD.
  - Transformación pura en CSS (`@media (max-width: 768px)`) de todas las tablas (`.data-table`) en fichas verticales táctiles (cards) sin scroll horizontal.
  - Inyección de atributos semánticos `data-label` en celdas de las 8 tablas del sistema.
  - Celdas de acciones ergonómicas con botones a ancho completo y altura mínima >= 44px.
  - Preservación íntegra de la estructura tabular clásica en escritorio (`> 768px`).
  - Suite de pruebas Playwright (`e2e/responsive-mobile-cards.spec.ts`) con 4/4 tests pasando.
  - Quality Gate verificado con código de salida 0 (206/206 Vitest + 29/29 Playwright E2E pasando, 100%).

- [x] **Hito 14: Búsqueda Exhaustiva de Bugs y Cobertura Integral E2E (Completado: 2026-10-04)**
  - Especificación `specs/test-003-cobertura-integral-e2e-y-bug-hunting.md` implementada.
  - Corrección de bugs críticos descubiertos en E2E:
    - Normalización de rutas de tipos de medidor (`/tipos-medidor` y `/medidores/tipos`).
    - Corrección de esquema DTO en creación de instalaciones (`ubicacion` vs `direccion`).
    - Eliminación de deslogueo erróneo por 401 en cambio de contraseña (`isPasswordMismatch` guard).
    - Prevención de condiciones de carrera en carga asíncrona de selectores en modal de mantenimiento.
    - Idempotencia total en seed demo (`upsert` restaurando `nombre` y `activo: true` en usuarios y medidores).
  - 5 nuevas suites E2E en Playwright implementadas:
    - Catálogo y Aprovisionamiento (`e2e/catalogo-aprovisionamiento.spec.ts`).
    - Seguridad, Perfil y Autoservicio (`e2e/seguridad-usuarios-perfil.spec.ts`).
    - Ciclo de Vida Metrológico y Bajas Técnicas (`e2e/mantenimiento-ciclo-vida.spec.ts`).
    - Reglas Dinámicas de Alerta en Caliente (`e2e/alertas-incidentes.spec.ts`).
    - Resiliencia de UI y Empty States (`e2e/resiliencia-ui-empty-states.spec.ts`).
  - Cobertura E2E ampliada a 37/37 pruebas pasando (100% verde en 15 suites).
  - Quality Gate verificado con código de salida 0 (206/206 Vitest + 37/37 Playwright E2E).

- [x] **Hito 15: Autenticación Visual Diferenciada por Entorno y Pantalla de Login (Completado: 2026-10-04)**
  - Formalización inmutable de ADR 0012 (`docs/adr/0012-autenticacion-visual-diferenciada-por-entorno.md`).
  - Especificación `specs/feat-018-pantalla-login-y-sesion-multi-entorno.md` implementada bajo Agentic TDD.
  - Endpoint backend `GET /api/config` para resolver `NODE_ENV` y bandera `devRoleSwitcher`.
  - Pantalla formal de Inicio de Sesión (`#viewLogin`) con Aurora Design System, inputs semánticos (`autocomplete`), toggle de contraseña y feedback accesible de errores (401/429).
  - Discriminación estricta de entorno: barra de simulación y drawer rápido activos en desarrollo; completamente ocultos y auto-login bloqueado en Staging y Producción.
  - Flujo de Cierre de Sesión (Logout) integrado en navbar y drawer móvil con redirección limpia a login y persistencia contra auto-login indeseado.
  - Prevención de condiciones de carrera en hidratación asíncrona de sesión (`sessionSyncPromise` en `switchRole`).
  - Suite E2E ampliada con `e2e/login-pantalla-real.spec.ts` (6 nuevos tests, 43/43 tests Playwright pasando, 100%).
  - Quality Gate verificado con código de salida 0 (207/207 Vitest + 43/43 Playwright E2E).

---

## 🗺️ Hoja de Ruta / Roadmap de Hitos Futuros (Backlog TO-DO)

- [ ] **Hito 16: Sub-Facturación y Liquidación de Consumos (Medidores Remarcadores)**
  - Jerarquía de medidores remarcadores por local, oficina o departamento vinculados a un medidor matriz/general.
  - Cálculo de prorrateo por m³/kWh según tarifas configurables, cargos fijos y balance de áreas comunes.
  - Generación de comprobantes, reportes de cobro y exportación de pre-liquidaciones.

---

## 🎯 Especificación Activa
- **Archivo:** `specs/feat-032-graficos-barras-bajo-demanda.md`
- **Módulo objetivo:** Gráficos de barras y detalle paginado bajo demanda. Completado y verificado.

---

## 📝 Registro de Tareas Recientes
| Fecha | Autor | Acción Realizada | Resultado |
| :--- | :--- | :--- | :--- |
| 2026-10-03 | Antigravity | Inicialización del Blueprint agnóstico Hito 0 | Semilla creada y vinculada a GitHub |
| 2026-10-03 | Antigravity | Ejecución y Auto-Sellado de Hito 0 (Sistema Medidores) | ADR 0001, entorno configurado y Quality Gate superado |
| 2026-10-03 | Antigravity | Implementación de `feat-001-instalaciones-y-usuarios` | Ciclo TDD completado, 19/19 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-002-catalogo-medidores` | Ciclo TDD completado, 36/36 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-003-registro-lecturas` | Ciclo TDD completado, 51/51 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-004-dashboard-admin` | Ciclo TDD completado, 59/59 tests pasando, Quality Gate 0 |
| 2026-10-03 | Antigravity | Creación del Servidor HTTP y Dashboard Web Base | Fastify con SQLite y seed de datos demo, 60/60 tests pasando |
| 2026-10-03 | Antigravity | Formalización de ADR 0002 y Frontend Design System | Tokens Claro/Oscuro, ApiClient desacoplado y componentes reutilizables |
| 2026-10-03 | Antigravity | Implementación de `feat-005-autenticacion-rbac` | Roles Admin, Supervisor y Operador con guardias y JWT, 74/74 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-006-gestion-usuarios-y-password` | CRUD usuarios admin, cambio y reset de claves, 88/88 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-007-reportes-y-exportacion` | Ciclo TDD completado, exportación CSV y conciliación de facturas |
| 2026-10-03 | Antigravity | Implementación de `feat-008-alertas-y-anomalias` | Ciclo TDD completado, motor de detección y resolución de incidentes |
| 2026-10-03 | Antigravity | Implementación de `feat-009-mantenimiento-y-calibracion` | Ciclo TDD completado, bitácora técnica, precintos y calibraciones |
| 2026-10-03 | Antigravity | Integración Frontend Aurora Design System | Vistas y modales interactivos integrados, 125/125 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `infra-001-docker-y-cicd` | Multi-stage Dockerfile, docker-compose, CI workflow, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `infra-002-entorno-staging` | Staging compose, Zod NODE_ENV staging, 126/126 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-010-pwa-offline-sync` | PWA, Service Worker, Batch Sync y SyncManager, 129/129 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-011-seguridad-healthchecks-auditoria` | Rate limiting, probes /healthz y /readyz, y Auditoria inmutable, 143/143 tests, Quality Gate 0 |
| 2026-10-03 | Antigravity | Implementación de `feat-012-webhooks-notificaciones` | Webhooks salientes, firma HMAC, fail-safe, UI y 170/170 tests pasando |
| 2026-10-03 | Antigravity | Implementación de `feat-013-logs-estructurados-y-error-webhooks` | ADR 0006, Pino nativo, reqId, errorHandler y webhooks 500 fail-safe, 174/174 tests |
| 2026-10-03 | Antigravity | Ejecución `/learn` (Reglas 13 y 14 en AGENTS.md) | Formalización de webhooks salientes y observabilidad crítica en AGENTS.md y UI |
| 2026-10-03 | Antigravity | Implementación de `test-001-e2e-playwright` (Hito 10) | ADR 0007, Playwright en modo headless, suites E2E completas y CI (6/6 tests) |
| 2026-10-03 | Antigravity | Ejecución `/learn` (Reglas 11 y 15 en AGENTS.md) | Formalización de exención segura E2E y desacoplamiento de runners (Vitest vs Playwright) |
| 2026-10-03 | Antigravity | Implementación de `feat-014-notificaciones-push-y-telegram` (Hito 11) | ADR 0008, Web Push (VAPID/SW), Telegram Bot nativo, bitácora inmutable y E2E (7/7 tests) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 13 y 15 en AGENTS.md) | Formalización de auto-purga 410 en Web Push y DOM scoping obligatorio en Playwright |
| 2026-10-04 | Antigravity | Implementación de `feat-015-endurecimiento-y-resiliencia` (Hito 12) | ADR 0009, SQLite WAL, Hot Backup, Graceful Shutdown, Helmet CSP, Backoff PWA y Quality Gate 0 (196 tests Vitest + 7 tests E2E) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 16 y 17 en AGENTS.md) | Formalización de concurrencia SQLite, raw PRAGMAs, hot backup y Helmet CSP scriptSrcAttr |
| 2026-10-04 | Antigravity | Rebuild de Staging en Docker y `test-002-cobertura-antirregresion-y-e2e` | Lockfile resincronizado, Staging certificado (3001), 206/206 tests Vitest y 19/19 tests Playwright E2E pasando (Quality Gate 0) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 8 y 15 en AGENTS.md) | Sincronización de lockfile para Docker, tipado estricto en page.evaluate y desacoplamiento de invariantes acumulativas |
| 2026-10-04 | Antigravity | Optimización y Modularización de Pipeline CI | Separación en 3 jobs paralelos (Quality Gate, Playwright E2E y Docker Builds), fix regex unidad M3 y GitHub Actions 100% verde |
| 2026-10-04 | Antigravity | Corrección CSP connect-src, Service Worker y Autocomplete | Dominios Google Fonts en CSP connect-src, exclusión de orígenes externos en sw.js fetch y atributos autocomplete en inputs de contraseña |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 12 y 17 en AGENTS.md) | Formalización de acotamiento de origen en Service Worker, dominios en connect-src y atributos autocomplete obligatorios |
| 2026-10-04 | Antigravity | Formalización de ADR 0010 y SDD `feat-016` (Hito 13) | Estrategia Mobile-First (320px -> 375px -> 425px+), Drawer accesible, touch targets y E2E móvil |
| 2026-10-04 | Antigravity | Implementación de `feat-016-adaptabilidad-movil-responsive` | Breakpoints 320px a 1024px+, Drawer móvil, zero overflow y suite Playwright móvil (24/24 E2E + 206/206 Vitest) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Regla 18 en AGENTS.md) | Formalización de arquitectura responsiva mobile-first, ergonomía táctil y visibility en drawers off-canvas para Playwright |
| 2026-10-04 | Antigravity | Corrección de selectores y filtros en listas móviles | Contención de .form-select (max-width, ellipsis), flex-wrap en card-header, reports-filter-grid y test Playwright (25/25 E2E + 206/206 Vitest) |
| 2026-10-04 | Antigravity | Formalización de ADR 0011 y SDD `feat-017` (Hito 13.1) | Fichas Adaptativas Móviles (Stacked Cards) para todas las tablas (`.data-table`) sin scroll horizontal |
| 2026-10-04 | Antigravity | Implementación de `feat-017-fichas-moviles-tablas-responsive` | CSS `@media (max-width: 768px)`, inyección `data-label`, botones >= 44px, E2E (29/29 Playwright + 206/206 Vitest) |
| 2026-10-04 | Antigravity | Corrección de desbordamiento en fichas móviles (.cell-stacked) | Eliminación de overflow en badges múltiples, saltos de línea y bloques pre JSON en fichas a 320px, 0 desbordes confirmados |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Regla 19 en AGENTS.md) | Formalización de invariantes de contención (`.cell-stacked`, `.badges-wrapper`, ruptura de texto y aislamiento de bloques `<pre>`) en fichas móviles |
| 2026-10-04 | Antigravity | Implementación de `test-003-cobertura-integral-e2e-y-bug-hunting` (Hito 14) | Corrección de bugs de catálogo, esquema, sesión y carrera modal; 5 nuevas suites E2E Playwright (37/37 tests pasando, 100%) y Quality Gate 0 (206 tests Vitest) |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 4 y 15 en AGENTS.md) | Formalización de discriminación 401 en clientes web, restauración de semillas y aislamiento con entidades efímeras en E2E |
| 2026-10-04 | Antigravity | Sincronización integral de `README.md` | Actualización de README con arquitectura actual, 11 ADRs, Staging Docker, PWA, Playwright E2E y comandos |
| 2026-10-04 | Antigravity | Ejecución `/learn` (Reglas 8 y 15 en AGENTS.md) | Formalización de certificación E2E en Staging y resolución de rutas con symlinks en CLIs de testing |
| 2026-10-04 | Antigravity | Implementación de ADR 0012 y `feat-018` (Hito 15) | Login formal, logout, multi-entorno (dev vs staging/prod), 43/43 E2E Playwright y 207 tests Vitest (Quality Gate 0) |
| 2026-10-05 | Antigravity | Formalización de ADR 0015 y SDD `feat-020` (Hito 15.3) | Hash Router cliente (`/#/[modulo]`), data-testids estables en vistas/modales, bus `window.__DIAGNOSTICS__`, seed determinista y suite E2E de explorabilidad (49/49 Playwright + 263/263 Vitest, Quality Gate 0) |
| 2026-10-05 | Antigravity | Ejecución `/learn` (Regla 24 en AGENTS.md) | Formalización de explorabilidad, rutas hash persistentes, ciclo de vida de modales y observabilidad en cliente para agentes |
| 2026-10-06 | Antigravity | Implementación de `feat-021-aislamiento-territorial-rbac-multi-sede` | Aislamiento territorial RBAC multisede en Catálogo, Dashboard, Reportes, Alertas, Mantenimiento y UI. Suite `tests/server.location-scoping.test.ts` (13/13 tests pasando), Quality Gate 0 (277 tests Vitest). |
| 2026-10-06 | Antigravity | Ejecución `/learn` (Regla 25 en AGENTS.md) | Formalización de aislamiento territorial RBAC multi-sede, inyección preHandler allowedInstalacionIds, filtrado fail-closed y rechazo 403 |




| 2026-10-07 | OpenCode | Hardening fail-closed del simulador de rol (ADR 0012) | `roleSimulatorBar` y `mobile-simulator-section` nacen ocultos en `public/index.html` y solo JS los revela en dev; espejo del fix Edge. Quality Gate 0. |
| 2026-10-07 | OpenCode | Implementación de `feat-027-demo-dev-only-y-health-real` | Demo solo en dev (botones ocultos + `403 DEMO_SEED_DISABLED` en staging/prod) y badge real con `GET /readyz` (En línea/Sin servidor/Degradado, polling 30s). Quality Gate 0 (338/338 Vitest + 9/9 E2E). |
