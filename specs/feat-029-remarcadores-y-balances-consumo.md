# Spec: feat-029 — Remarcadores jerárquicos y balances de consumo

- **Fecha:** 2026-10-15.
- **Estado:** Implementada y verificada el 2026-10-15; alcance autorizado explícitamente por el usuario.
- **Base:** ADR 0001 (capas y lecturas inmutables), ADR 0004 (auditoría), ADR 0013 (RBAC), ADR 0014 (simetría de DTOs) y ADR 0015 (explorabilidad).
- **Antecedentes:** feat-003, feat-007, feat-021, feat-022, feat-024, feat-025 y feat-028.

> SDD + Agentic TDD: validar este contrato antes de escribir producción. Contratos Zod primero, pruebas rojas ejecutadas después e implementación mínima por entregas. No modificar ADR aceptados, instalar dependencias ni publicar cambios como parte de esta especificación.

## 1. Resultado esperado

Representar una instalación como un bosque de medidores: cada equipo tiene cero o un padre y puede alimentar varios remarcadores; un remarcador puede ser padre de otros remarcadores. Conservar una única entidad `Medidor`, sus lecturas, factores y mantenimiento.

Mostrar tres magnitudes distintas para un mismo intervalo:

1. **Consumo medido:** diferencia temporal entre dos lecturas del propio equipo.
2. **Consumo distribuido:** suma del consumo medido de sus hijos directos.
3. **Saldo sin distribuir:** consumo medido del padre menos consumo distribuido.

El saldo puede representar áreas comunes, sectores sin medir, diferencias de medición o pérdidas. No clasificar automáticamente una diferencia como fuga.

Ejemplo con lecturas de apertura y cierre comparables, en m³:

| Equipo | Padre | Consumo medido | Distribuido a hijos | Saldo sin distribuir |
| --- | --- | ---: | ---: | ---: |
| General | — | 100 | 75 | 25 |
| Edificio A | General | 40 | 25 | 15 |
| Cocina | Edificio A | 10 | 0 | 10 |
| Lavandería | Edificio A | 15 | 0 | 15 |
| Edificio B | General | 35 | 0 | 35 |

Total de la instalación: **100**, nunca 200. Los hijos desglosan un consumo ya incluido en su padre. Para una hoja, el saldo coincide con su consumo medido: no existen hijos que permitan distribuirlo.

## 2. Alcance y archivos autorizados para la implementación

### Incluidos

- Alta, consulta y cambio de padre con vigencia temporal, auditoría y validación transaccional.
- Consumo acumulativo entre lecturas consecutivas y consumo observado en un rango.
- Balance por nodo, desglose jerárquico y total de instalación sin doble conteo.
- Integración en Parque, Modo Terreno, Reportes y Dashboard existentes.
- Adaptación de consolidación, CSV y conciliación de facturas para evitar sumar padres e hijos.
- Pruebas de persistencia real, permisos, concurrencia y navegación móvil.

### Archivos editables autorizados

- `specs/feat-029-remarcadores-y-balances-consumo.md`
- `STATE.md`
- `vitest.config.ts` (exclusión del repositorio hijo para ejecutar el gate del padre)
- `scripts/verify.sh` (no ocultar fallos de aprovisionamiento Prisma)
- `playwright.config.ts` (puerto configurable para certificación aislada)
- `prisma/schema.prisma`
- `src/server.ts` (solo composición de servicios y permisos de endpoints nuevos)
- `src/modules/medidores/medidores.schema.ts`
- `src/modules/medidores/medidores.service.ts`
- `src/modules/medidores/medidores.repository.ts`
- `src/modules/medidores/medidores.controller.ts`
- `src/modules/consumos/consumos.schema.ts` (nuevo)
- `src/modules/consumos/consumos.service.ts` (nuevo)
- `src/modules/consumos/consumos.repository.ts` (nuevo)
- `src/modules/lecturas/lecturas.schema.ts`
- `src/modules/lecturas/lecturas.service.ts`
- `src/modules/lecturas/lecturas.repository.ts`
- `src/modules/lecturas/lecturas.controller.ts`
- `src/modules/reportes/reportes.schema.ts`
- `src/modules/reportes/reportes.service.ts`
- `src/modules/reportes/reportes.repository.ts`
- `src/modules/reportes/reportes.controller.ts`
- `src/modules/dashboard/dashboard.schema.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.repository.ts`
- `src/modules/auditoria/auditoria.schema.ts` (solo nuevas acciones tipadas)
- `public/index.html`
- `public/app.js`
- `public/app.css`
- `public/js/api.js`
- `public/js/components.js`
- `public/js/charts.js`
- `public/sw.js` (solo versión de caché para entregar los recursos actualizados)
- `tests/modules/medidores/medidores.service.test.ts`
- `tests/modules/medidores/medidores.controller.test.ts`
- `tests/modules/medidores/medidores.jerarquia.test.ts` (nuevo)
- `tests/modules/consumos/consumos.service.test.ts` (nuevo)
- `tests/modules/consumos/consumos.repository.test.ts` (nuevo)
- `tests/fixtures/feat-028-schema.prisma` (snapshot fijo del esquema previo para verificar adopción después del commit y en clones sin historial)
- `tests/modules/lecturas/lecturas.service.test.ts`
- `tests/modules/lecturas/lecturas.controller.test.ts`
- `tests/modules/reportes/reportes.service.test.ts`
- `tests/modules/reportes/reportes.controller.test.ts`
- `tests/modules/dashboard/dashboard.service.test.ts`
- `tests/modules/dashboard/dashboard.controller.test.ts`
- `tests/modules/dashboard/dashboard.series.test.ts`
- `tests/server.remarcadores.test.ts` (nuevo)
- `e2e/remarcadores-balances.spec.ts` (nuevo)
- `e2e/reportes-conciliacion.spec.ts`
- `e2e/lecturas-terreno.spec.ts`
- `e2e/dashboard-graficos.spec.ts`
- `scripts/test-contract-symmetry.mjs` (solo contratos ampliados por esta feature)

**Protegidos:** `src/core/*`, `docs/adr/*`, dependencias y lockfile, configuración global salvo los ajustes de runners y gate enumerados arriba, infraestructura de despliegue, módulos restantes y repositorio hijo `deploy-cloudflare/`. No sincronizar ni desplegar el hijo en este trabajo. Si la implementación descubre un archivo imprescindible fuera de esta lista, actualizar primero el alcance del contrato.

**Fuera de alcance:** remarcadores virtuales con fórmulas arbitrarias, múltiples padres, conversiones de unidades, flujos bidireccionales, interpolación, reinicios/rollover de relojes y cálculos de energía a partir de potencia instantánea. Conservar el comportamiento existente de NIVEL/INSTANTANEO; la jerarquía de balance de esta primera versión admite únicamente ACUMULATIVO.

## 3. Modelo y vigencia de relaciones

- Añadir `Medidor.medidorPadreId: String?`, FK al UUID de otro `Medidor`, relación inversa `remarcadores` e índice por padre. Nulo representa una raíz. No identificar relaciones por códigos o nombres.
- Añadir `MedidorVinculo` como secuencia de eventos inmutables: `id`, `medidorId`, `medidorPadreId` nullable, `vigenteDesde`, `usuarioId`, `createdAt`. Índice por `(medidorId, vigenteDesde)` y unicidad de esa pareja.
- Cada evento significa «desde este instante el padre es X»; un evento con padre nulo desvincula. El siguiente evento delimita el final de la vigencia anterior; no actualizar ni borrar eventos históricos.
- `medidorPadreId` es la proyección actual. Actualización de proyección, inserción del evento y registro `AuditoriaEvento` deben ser atómicos en una transacción Prisma. Si falla uno, no persistir ninguno.
- Antes del primer evento, un equipo se considera raíz desde su creación. La adopción deja todos los equipos existentes con padre nulo y conserva sus lecturas. No inventar relaciones históricas.
- El servidor fija `vigenteDesde`; no aceptar retroactividad ni programación futura en esta versión. Si dos cambios comparten timestamp, rechazar el segundo con conflicto tipado.
- Una asignación al mismo padre actual es un no-op idempotente: no generar otro evento ni auditoría.
- Validar ciclos y compatibilidad dentro de la misma transacción que persiste el vínculo. Serializar escrituras y tratar conflictos SQLite sin producir un ciclo ante A→B y B→A concurrentes.
- Archivar un padre con hijos activos se rechaza hasta archivarlos o desvincularlos explícitamente. Restaurar un hijo exige padre activo, o desvinculación explícita previa. No ejecutar cascadas silenciosas.
- Ningún equipo con vínculos históricos entrantes o salientes admite eliminación física; conservar las reglas actuales para equipos sin tales dependencias. Las FKs usan restricción de borrado.
- Impedir cambios de tipo que vuelvan incompatible una relación vigente. No permitir cambiar recurso/unidad/modo de un tipo con lecturas o vínculos históricos; esos cambios requieren otro tipo/equipo y un proceso posterior de reemplazo. Edición de nombres y códigos sigue las reglas actuales.

## 4. Contratos de entrada y permisos

Definir los siguientes contratos Zod antes de producción; DTOs de salida mantienen los alias exigidos por ADR 0014.

| Operación | Contrato | Permisos |
| --- | --- | --- |
| `POST /api/medidores` | Agregar `medidorPadreId?: UUID \| null`; omitido significa raíz | ADMIN; SUPERVISOR solo en sedes asignadas, como el alta actual |
| `PATCH /api/medidores/:id/padre` | Cuerpo estricto `{ medidorPadreId: UUID \| null }` | ADMIN |
| `GET /api/medidores` y `GET /api/medidores/:id` | Agregar padre actual `{ id, codigo } \| null` y `medidorPadreId` | Mantener RBAC y alcance territorial |
| `GET /api/medidores/:medidorId/consumo-actual` | Dos últimas lecturas cronológicas y DTO de consumo | ADMIN y usuarios asignados, incluido OPERADOR |
| `GET /api/reportes/balances` | Query `{ instalacionId: UUID, fechaInicio: Date, fechaFin: Date }` | ADMIN y SUPERVISOR asignado |

Registrar la consulta de consumo junto a las rutas existentes `/medidores/:medidorId/lecturas` y `/medidores/:medidorId/lecturas/ultima`, en el controlador de lecturas. No cambiar URLs previas.

- Rango obligatorio con `fechaInicio < fechaFin`, fechas válidas y no futuras. HTTP usa ISO 8601 con zona; frontend convierte el día local completo a instantes UTC sin suponer que la medianoche local es `00:00Z`.
- Autenticación antes de acceso a datos: 401 sin token; 403 para rol o sede ajena; 404 para entidad inexistente cuando el solicitante tiene acceso al ámbito.
- Ambos equipos deben existir, estar activos, pertenecer a la misma instalación, recurso y unidad exactos, y tener modo ACUMULATIVO. Factores diferentes son válidos si sus lecturas representan la misma unidad real.
- Padre diferente del propio medidor y de cualquier descendiente, sin límite funcional fijo de profundidad. Recorrido iterativo y detección de corrupción defensiva; no truncar silenciosamente árboles.
- No aceptar actor, IP, rol ni lista territorial enviados por el cliente como fuente de autoridad.

## 5. Consumo temporal de un medidor

### 5.1 Entre lecturas consecutivas

Seleccionar las dos últimas lecturas por `fechaLectura`, no por orden de inserción. Para un acumulativo, `consumo = lecturaActual.valor - lecturaAnterior.valor`.

- `valor` ya contiene el factor aplicado: no multiplicar de nuevo. No recalcular históricos con el factor configurado hoy.
- Cero o una lectura: `estado = DATOS_INSUFICIENTES`, `consumo = null`; una lectura inicial no representa consumo cero.
- Dos lecturas iguales con timestamps distintos: `estado = CALCULADO`, `consumo = 0` válido.
- Factores aplicados diferentes entre puntos, o metadatos legacy que no permitan acreditar continuidad: `estado = NO_COMPARABLE`, `consumo = null`, motivo tipado. La corrección metrológica de transiciones de factor queda fuera de alcance.
- Para NIVEL/INSTANTANEO, devolver `NO_APLICA` en este cálculo de delta acumulativo. No etiquetar un promedio de potencia como consumo energético.
- Conservar la prohibición de lecturas acumulativas decrecientes. Datos históricos incoherentes generan `NO_COMPARABLE`, no un cero obtenido con `Math.max(0, delta)`.

### 5.2 En un rango solicitado

1. Apertura: última lectura con `fechaLectura <= fechaInicio`.
2. Cierre: última lectura con `fechaLectura <= fechaFin`.
3. Exigir puntos distintos y al menos un cierre posterior al inicio solicitado. Si no hay referencia anterior al inicio, estado insuficiente; no sustituirla silenciosamente por la primera lectura posterior.
4. Exponer siempre timestamps reales. Si apertura/cierre no coinciden con los límites solicitados, describir el resultado como consumo **observado entre lecturas**, con `cobertura = PARCIAL`; solo coincidencia exacta implica `COMPLETA`.
5. No estimar consumo antes/después de las observaciones ni repartirlo proporcionalmente.

DTO compartido de consumo (especificar como unión discriminada Zod):

```typescript
type EstadoConsumo = "CALCULADO" | "DATOS_INSUFICIENTES" | "NO_COMPARABLE" | "NO_APLICA";
type MotivoConsumo = "SIN_LECTURA_INICIAL" | "SIN_LECTURA_FINAL"
  | "SIN_DOS_LECTURAS" | "FACTOR_NO_COMPARABLE" | "LECTURAS_INCOHERENTES"
  | "MODO_NO_ACUMULATIVO";
// Cada respuesta incluye:
// medidorId, unidad, estado, motivo: MotivoConsumo | null,
// consumo: number | null, lecturaInicial: punto | null, lecturaFinal: punto | null,
// fechaInicioSolicitada: Date | null, fechaFinSolicitada: Date | null,
// cobertura: "COMPLETA" | "PARCIAL" | "INSUFICIENTE".
// punto incluye id, valor, fechaLectura, timestamp, fecha y multiplicadorAplicado.
```

Solo `CALCULADO` permite consumo numérico; los otros estados requieren null. La UI muestra «Sin lectura anterior», «Datos insuficientes» o motivo equivalente, nunca `0` para null.

## 6. Balance jerárquico y totales

- Reconstruir la topología vigente durante el intervalo real de las observaciones. No aplicar a un período pasado el padre actual.
- Para cada nodo restar exclusivamente hijos directos: `distribuido = sum(consumoHijo)` y `saldo = consumoPadre - distribuido`. Los nietos ya están incluidos en el hijo.
- Primera versión conservadora: padre e hijos deben compartir timestamps exactos de apertura y cierre y tener consumos calculados. Fechas diferentes ⇒ `NO_COMPARABLE / PERIODOS_NO_ALINEADOS`. Sin interpolación ni tolerancia temporal implícita.
- Si la topología cambia entre apertura y cierre, devolver `NO_COMPARABLE / VINCULO_CAMBIO_EN_PERIODO`; no atribuir todo el delta a uno de los padres ni dividirlo sin lecturas de frontera.
- Un hijo insuficiente/no comparable invalida el distribuido y saldo del padre; no excluirlo para aparentar un resultado completo. Conservar el consumo propio calculable del padre.
- Saldo negativo: conservar el signo y marcar `ADVERTENCIA / HIJOS_SUPERAN_PADRE`. No usar clamp ni declarar fuga automáticamente.
- Incluir equipos archivados que pertenecían a la topología histórica y sus lecturas. El filtro actual `activo` no decide retrospectivamente qué consumos existieron.
- Cada nodo retorna `medidorId`, `medidorCodigo`, `medidorPadreId`, `profundidad`, recurso/unidad, DTO de consumo propio, IDs de hijos directos, `consumoDistribuido: number | null`, `saldoSinDistribuir: number | null`, estado y motivos. El árbol se serializa como lista plana ordenada padre-antes-de-hijos, con hermanos ordenados por código e ID.
- Sumar únicamente raíces del período para el total de instalación. Agrupar por recurso **y unidad**; no sumar agua con electricidad ni litros con m³. Si las raíces no comparten intervalo observado o existe cambio de topología, total no comparable; no presentar una suma parcial como total.
- El desglose puede mostrar todos los nodos, pero debe identificar cuáles participan en el total. Reportes, dashboard y conciliación no suman el desglose completo.
- Redondear según la precisión vigente de dos decimales y realizar sumas/restas de valores normalizados en centésimas para evitar residuos binarios visibles. No añadir bibliotecas.

## 7. Integración y compatibilidad

- Centralizar selección temporal, delta y balance en `src/modules/consumos/`. Controllers traducen HTTP; servicios de dominio aplican invariantes; repositorios consultan y persisten. Reutilizar este cálculo en lecturas, reportes y dashboard; no copiar fórmulas divergentes en frontend.
- Preservar URLs, alias y campos existentes. Agregar estado, motivo, intervalo real y referencia al nuevo DTO de consumo. Los campos numéricos legacy siguen siendo numéricos para consumidores existentes; cuando no hay cálculo válido, el nuevo estado/DTO es la fuente de verdad y la UI muestra ausencia de dato. No usar el cero legacy para sumar ni conciliar.
- Para ACUMULATIVO con dos puntos válidos, `consumoNeto` refleja el delta seleccionado incluyendo la referencia anterior al inicio. Documentar esta corrección de resultados, especialmente con una sola lectura dentro del rango.
- CSV conserva las columnas previas y añade padre, participación en total, estado y fechas reales; consumos no calculables se exportan vacíos, sin escribir un cero ficticio. Esta representación CSV se especifica explícitamente aunque el DTO legacy mantenga un campo numérico.
- Facturas: comparar solo raíces compatibles de recurso/unidad; ante cobertura incompleta, referencia ausente o topología no comparable, mantener `PENDIENTE` y magnitudes de conciliación nulas. No declarar CONCILIADO con datos insuficientes.
- Dashboard: total por raíces y desglose diferenciados. Graficar delta temporal como consumo y valor del contador como lectura; etiquetas y unidades explícitas. No convertir null en cero al dibujar.
- Equipos sin vínculos conservan sus lecturas, permisos y semántica anterior salvo la corrección explícita de apertura de período y presentación de datos insuficientes. No modificar algoritmos NIVEL/INSTANTANEO ni eventos de alertas en esta entrega.
- Adopción aditiva del esquema mediante el mecanismo `prisma db push` existente, primero en SQLite temporal/copias de prueba; sin reset, borrado ni aceptación de pérdida de datos. Ejecutar `npx prisma generate` inmediatamente después del cambio de schema y antes de adaptar repositorios. No certificar ni migrar una base productiva como parte de las pruebas.

## 8. Interfaz y ergonomía

- Parque: selector «Medidor padre (opcional)» en alta; acción ADMIN para cambiar/desvincular padre. Opciones limitadas a equipos compatibles; excluir propio equipo y descendientes. La API valida nuevamente.
- Mostrar relación principal/remarcador, código del padre y ruta jerárquica sin cambiar los códigos identificadores. Reabrir formulario conserva la selección persistida.
- Modo Terreno: lectura anterior y actual, fechas, unidad y consumo entre ambas. Tras guardar/sincronizar, refrescar el dato calculado desde backend. Lecturas todavía en cola offline se identifican como pendientes y no modifican el balance confirmado.
- Reportes: sección «Balance por sectores» con filtro de instalación y fechas, consumo medido/distribuido/saldo, cobertura real y motivos de no comparabilidad. Mensaje explícito cuando las lecturas no están alineadas.
- `data-testid`: `select-medidor-padre`, `btn-cambiar-padre`, `modal-cambiar-padre`, `form-cambiar-padre`, `btn-submit-cambiar-padre`, `btn-close-modal-cambiar-padre`, `consumo-entre-lecturas`, `balance-sectores`, `balance-nodo-{id}`. Mantener IDs previos; modal con `data-state` y `aria-hidden`.
- Estados visibles de carga, vacío, fallo y datos insuficientes. Sin `undefined`, `Invalid Date`, NaN o null textual. Toda fecha pasa por helper seguro; ausencia de fecha se representa como ausencia, no como fecha de hoy.
- Árbol/lista legible a 320 px sin indentación ilimitada: ruta textual con corte de palabras y nivel explícito. Tablas con `data-label`, controles táctiles de 44 px, inputs de 16 px y cero overflow a 320/375/425/768/1024 px. Preservar una sola estructura DOM por tabla.

## 9. Errores de dominio y auditoría

Cada error de comando hereda de `DomainError`, declara `readonly code` y `readonly statusCode`, y recibe mensaje/metadata en `super`. No usar excepciones genéricas ni strings mágicos.

| Código | HTTP | Condición |
| --- | ---: | --- |
| `MEDIDOR_NOT_FOUND` | 404 | Equipo objetivo inexistente |
| `MEDIDOR_PADRE_NOT_FOUND` | 404 | Padre inexistente dentro del ámbito autorizado |
| `INSTALACION_NO_ASIGNADA` | 403 | Acceso territorial no autorizado |
| `MEDIDOR_JERARQUIA_CICLICA` | 422 | Autorreferencia o ciclo |
| `MEDIDOR_PADRE_INCOMPATIBLE` | 422 | Sede, recurso, unidad, modo o actividad incompatibles |
| `MEDIDOR_CON_REMARCADORES_ACTIVOS` | 422 | Archivado de padre con hijos activos |
| `MEDIDOR_CON_VINCULOS_NO_ELIMINABLE` | 422 | Intento de eliminar un equipo con historial de relaciones |
| `TIPO_MEDIDOR_CON_HISTORIAL_INCOMPATIBLE` | 422 | Cambio metrológico que invalida datos o vínculos |
| `MEDIDOR_VINCULO_CONFLICTO` | 409 | Escritura concurrente o vigencia duplicada |
| `RANGO_FECHAS_INVALIDO` | 400 | Rango inválido o futuro |

Datos insuficientes, períodos desalineados y saldo negativo son resultados de consulta HTTP 200 con estados/motivos tipados; no excepciones 500.

Añadir al enum central las acciones `MEDIDOR_PADRE_ASIGNADO`, `MEDIDOR_PADRE_CAMBIADO`, `MEDIDOR_PADRE_DESVINCULADO`. Registrar actor autenticado, IP, equipo, padre anterior/nuevo y vigencia. Auditoría permanece append-only y su consulta sigue reservada a ADMIN.

## 10. Criterios de aceptación y pruebas

Todas las comprobaciones siguientes requieren prueba roja ejecutada antes del código que las satisface y prueba verde posterior. Mutaciones verificadas con GET independiente y, cuando corresponda, reabrir formulario/recargar página.

- [x] **Contratos:** campos omitidos/null/UUID inválido, cuerpos estrictos, rangos, discriminación estado/consumo, alias y serialización de fechas.
- [x] **Jerarquía:** varios hijos, nietos, raíces múltiples, desvinculación y cambio de padre; persistencia tras nueva instancia de servicio. Omitir padre al crear conserva funcionamiento legacy.
- [x] **Invariantes:** rechazo de ciclo directo/indirecto, padre inexistente/inactivo, sede/recurso/unidad/modo incompatibles, restauración incompatible y cambios de tipo destructivos. Ningún fallo deja eventos parciales.
- [x] **Transacciones reales:** fallo de auditoría revierte padre y vigencia; A→B y B→A concurrentes nunca dejan un ciclo. No-op no duplica registros.
- [x] **Historia:** balance previo a cambio de padre no cambia; rango que cruza cambio queda no comparable; archivados históricos se incluyen; equipo con vínculos no se elimina físicamente.
- [x] **Delta:** 1250→1380 da 130; valores iguales dan 0 válido; cero/una lectura devuelve null; factor se aplica una sola vez; cambio de factor o datos incoherentes no devuelve consumo inventado.
- [x] **Selección Prisma real:** apertura anterior o igual al inicio y cierre anterior o igual al fin, orden por fecha, sin cierre nuevo, sin apertura, límites exactos y cobertura parcial. No basta un mock que ya entregue datos filtrados.
- [x] **Balance:** fixture 100/40/35/10/15 produce saldos 25 y 15; nietos no se restan dos veces; hojas conservan consumo propio; falta de un hijo invalida saldo; timestamps desalineados no se comparan; saldo negativo se conserva y advierte.
- [x] **Totales:** instalación suma raíces una vez; separar recursos/unidades; totales no comparables si raíces desalineadas; dashboard, CSV y facturas usan el mismo criterio. Factura insuficiente queda PENDIENTE.
- [x] **Seguridad API:** 401 anónimo, 403 OPERADOR en balances y cambios, SUPERVISOR limitado a su sede, ADMIN global; `allowedInstalacionIds=[]` no filtra hacia acceso global. La nueva consulta de consumo del OPERADOR verifica su asignación.
- [x] **E2E:** crear entidades efímeras con IDs propios, vincular padre→hijo→nieto, releer por API, recargar Parque y reabrir modal; registrar dos rondas de lecturas y observar delta/balance; impedir ciclo; comprobar los estados insuficiente/no comparable; sin mutar datos de producción.
- [x] **Fechas E2E:** inyectar timestamps de prueba compartidos mediante API para el caso de balance alineado; un caso separado usa fechas distintas y exige NO_COMPARABLE. No ocultar desfases con aserciones permisivas.
- [x] **Móvil:** verificación cero overflow en todos los anchos indicados, acciones visibles y modal usable; selectores acotados a vista activa y `page.evaluate` tipado sin any.
- [x] **Adopción de datos:** base temporal con registros anteriores, sincronización aditiva y verificación posterior de IDs, conteos, lecturas y factores; todas las raíces iniciales nulas. No usar una base vacía como única prueba de compatibilidad.
- [x] **Quality Gate:** `./scripts/verify.sh` salida 0 (Prisma + typecheck + lint + Vitest).
- [x] **Contratos UI:** `npm run test:contract` salida 0 contra servidor y almacenamiento de prueba aislados.
- [x] **Navegador:** `npx playwright test e2e/remarcadores-balances.spec.ts e2e/reportes-conciliacion.spec.ts e2e/lecturas-terreno.spec.ts e2e/dashboard-graficos.spec.ts` salida 0, con webServer y base de prueba aislada.
- [x] **STATE:** registrar por separado entregas y verificaciones reales; no declarar implementada la feature por haber escrito este documento.

## 11. Orden de implementación

1. **Entrega A — Consumo visible:** contratos y servicio compartido, selección de apertura/cierre, delta visible en Modo Terreno, pruebas de datos insuficientes y continuidad metrológica.
2. **Entrega B — Jerarquía:** esquema aditivo, vigencias/auditoría transaccionales, controles de ciclos/compatibilidad y formularios de Parque con persistencia comprobada.
3. **Entrega C — Balances:** topología histórica, saldos, totales por raíces, reportes/CSV/facturas/dashboard y certificación E2E móvil.

No cerrar la funcionalidad hasta completar las tres entregas. Commit, push, sincronización Edge y despliegue requieren su autorización de entrega correspondiente.


## 12. Evidencia de cierre

- Fase roja inicial: motor inexistente y consulta de jerarquía no implementada; fase roja UI: selector de padre ausente. Regresiones adicionales detectaron y corrigieron la omisión de raíces sin lecturas en facturación y la respuesta territorial de un padre ajeno.
- `DATABASE_URL=file:/tmp/medidores-remarcadores-gate-entrega.db NODE_ENV=test ./scripts/verify.sh`: salida 0, 37 archivos / 339 pruebas. El almacenamiento no existía antes de ejecutar el gate.
- `npm run build`: compilación de producción correcta.
- `BASE_URL=http://127.0.0.1:3029 DATABASE_URL=file:/tmp/medidores-remarcadores-e2e.db NODE_ENV=development node node_modules/@playwright/test/cli.js test e2e/remarcadores-balances.spec.ts e2e/reportes-conciliacion.spec.ts e2e/lecturas-terreno.spec.ts e2e/dashboard-graficos.spec.ts`: 9/9, salida 0. Caso adicional de balance con captura móvil repetido correctamente tras normalizar la entrada de milisegundos en Chromium.
- `API_BASE_URL=http://127.0.0.1:3030 npm run test:contract`: salida 0, vínculo padre-hijo verificado con GET y consumo insuficiente con null, además de contratos previos.
- Base local de desarrollo respaldada antes de aplicar el esquema; 212 medidores / 295 lecturas conservados, sin relaciones inventadas. Ninguna prueba funcional se ejecutó contra esta base local existente.
- Entregas A, B y C completadas en el repositorio padre. Commit y push de este repositorio autorizados explícitamente por el usuario el 2026-10-15; sincronización Edge y despliegue quedan fuera de esta entrega.
