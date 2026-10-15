# fix-030 — Gráficos de consumo entre lecturas

- Fecha: 2026-10-15. Contrato validado contra la solicitud explícita del usuario: los gráficos deben mostrar consumo, no acumulados.
- ADR aplicables: 0001 (capas/TDD), 0002 (cliente presentacional), 0013 (RBAC), 0014 (contratos), 0015 (testabilidad). Sin modificar ADR, dependencias, persistencia ni endpoints existentes.

## Comportamiento

- Nuevo `GET /api/dashboard/graficos`, query de feat-028. Conserva `/series` de lecturas para compatibilidad.
- Respuesta Zod agrupada por recurso y unidad: series de consumo por medidor y consumos por instalación del período. El selector de magnitud muestra un grupo a la vez; nunca sumar ni comparar unidades distintas.
- Para ACUMULATIVO, cada punto representa lectura actual menos inmediata anterior y lleva inicio/fin reales, estado y motivo. Reutilizar `calcularConsumo`; no reaplicar factor. Primera lectura, factor desconocido/cambiado o decremento: valor null, sin representarlo como cero ni conectar la línea a través del hueco. Cero confirmado sí se dibuja.
- Filtrar puntos por fecha de cierre; calcular con la anterior aunque quede fuera del rango o del límite. Orden ascendente; limitar después de calcular.
- Agregados sobre todo el rango, independientes del límite visual. Usar apertura <= inicio y cierre <= fin, fechas/cobertura reales y `construirBalance` por raíces históricas; sin doble conteo de remarcadores. Al seleccionar un medidor se muestra su consumo propio. Incluir raíces archivadas con historia para el total. No llamar consumo a NIVEL/INSTANTANEO: omitir estos modos con explicación visible.
- Todos los filtros se aplican en AND; scoping territorial fail-closed, 400/403 tipados como feat-028. Sin datos: grupos vacíos y mensaje accesible.
- Línea: consumo por intervalo; barras: consumo del período por instalación; dona: participación del consumo por instalación en la misma magnitud, nunca cantidad de equipos. No presentar participación si hay totales incompletos o períodos reales distintos.
- UI con unidades, fechas reales y explicación accesible de estados/deltas; fin de fecha seleccionado incluye el día local completo. Descartar respuestas antiguas tras cambios rápidos de filtro. Refrescar shell PWA.

## Archivos editables autorizados

- `specs/fix-030-graficos-consumo.md`
- `STATE.md`
- `src/modules/dashboard/dashboard.schema.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.controller.ts`
- `tests/modules/dashboard/dashboard.series.test.ts`
- `public/js/api.js`
- `public/js/charts.js`
- `public/app.js`
- `public/index.html`
- `public/sw.js`
- `e2e/dashboard-graficos.spec.ts`

## Aceptación y verificación

- [x] Fase roja: 100→130→150 produce 30 y 20; primera null; filtro/límite conserva referencia; cero real, factor desconocido/cambio y decremento; modos no acumulativos.
- [x] Totales por raíces, selección de hijo, fechas/cobertura, independencia del límite, múltiples unidades, scope y query HTTP válida/inválida.
- [x] Navegador con equipos efímeros confirma los valores entregados al renderer, dona por consumo, filtros y estados; responsive 320/375/425/768/1024.
- [x] Quality Gate salida 0, build y test:contract sobre base aislada. Sin commit/push como parte de esta solicitud.
