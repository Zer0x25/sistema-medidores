# chore-031 — Reinicio local y demo de dos meses

- Fecha: 2026-10-15. Autorizado por el usuario: reiniciar la DB y generar aproximadamente dos meses de datos para comprobar gráficos.
- ADR 0001/0004: conservar capas e históricos originales; sin cambios en ADR, dependencias, esquema, API demo existente ni producción.

## Resultado y operación

- Semilla reproducible para una base SQLite nueva, exclusivamente development/test, que rechaza una base no vacía. No incorpora eliminación de lecturas ni de auditorías.
- Crear respaldo SQLite consistente de la base local actual. Preparar otra base con esquema actual y semilla, validar antes de activarla, y cambiar únicamente DATABASE_URL de `.env` local. Conservar también la base original intacta. Reiniciar el proceso local de Medidores y comprobar `/readyz` y gráficos; preservar el otro servicio en 3000.
- Tres sedes con perfiles de demanda distintos y agua (M3), electricidad (KWH), gas (M3). Por sede/recurso, un general con dos hijos y un nieto: 36 equipos.
- Por equipo: 61 lecturas acumulativas, 60 intervalos diarios hasta una hora anterior al inicio de la operación. Fechas idénticas entre equipos, nunca futuras; instalaciones, medidores y vínculos existen desde antes de la apertura.
- Consumos deterministas con variación semanal, tendencia y picos controlados; hijos y nietos consumen menos que su padre y dejan saldo positivo. Valores reales, brutos y factor snapshot 1 coherentes.
- Tres usuarios demo y asignaciones territoriales. Auditoría append-only de creación de vínculos y semilla. Sin receptores externos configurados.
- Comando: `DATABASE_URL=file:/ruta/base-nueva.db npx tsx scripts/seed-historico.ts`; el esquema debe haberse aprovisionado antes. No instalar dependencias ni cambiar package.json.

## Archivos editables autorizados

- `specs/chore-031-seed-historico-local.md`
- `scripts/seed-historico.ts`
- `tests/seed-historico.test.ts`
- `STATE.md`
- `.env` (ignorado, únicamente activación de DATABASE_URL local)
- Bases locales y respaldos ignorados en `prisma/prisma/` y `backups/`.

## Aceptación

- [x] Pruebas rojas/verde en SQLite aislado: cantidades, fechas, no futuro, factores, monotonicidad, variación y jerarquía histórica coherente; rechazo de producción/base no vacía sin mutaciones.
- [x] Dashboard: 60 consumos calculados por serie, totales por raíces, dona comparable y balance con saldos positivos. Roles demo válidos.
- [x] Quality Gate salida 0 y comprobación real de API/navegador con la base candidata antes de activarla.
- [x] Base local activada, respaldo verificado y readiness correcto; informar fechas, credenciales y ubicación del respaldo. Sin commit/push.
