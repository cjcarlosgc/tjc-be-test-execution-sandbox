# Revisión de work item — 008-reliability-lifecycle (sweeper programado + fault injection)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint. Cierra los dos puntos que `harness/reports/delivery-008-health-readiness-review.md` había dejado explícitamente pendientes sin bloqueo: programación automática del sweeper y una prueba de fault injection concreta para cleanup.

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU14, HU19, HU23 (`spec/features/008-reliability-lifecycle/spec.md`).
- Sin decisiones `PENDING` bloqueantes.
- Implementado:
  - `WorkspaceSweeperService`: programa `WorkspaceManager.sweepExpired()` cada `SANDBOX_SWEEPER_INTERVAL_MS` (default 5 min) usando los hooks nativos de Nest (`OnModuleInit`/`OnModuleDestroy` + `setInterval`), sin agregar `@nestjs/schedule` como dependencia (se evaluó y se descartó por innecesaria para un único intervalo). El timer se marca `unref()` para no mantener el proceso vivo solo por el sweeper, y se limpia en `onModuleDestroy`. Un fallo de `sweepExpired()` se captura y registra (`sweeper run failed: ...`) sin detener la programación futura.
  - Test de fault injection nuevo en `execution-pipeline.service.spec.ts`: si `WorkspaceManager.cleanup()` en sí mismo lanza, el resultado `FAILED` ya persistido se conserva intacto y `pipeline.run()` sigue resolviendo (el error se registra como "unhandled pipeline error" pero no oculta el resultado principal) — cierra literalmente el punto de `timeouts-cleanup` transversal: "Un error de cleanup se registra de forma saneada y queda para el sweeper; no sustituye ni oculta el resultado principal."
- `tasks.md` de `008` queda con `idempotent cleanup`, `TTL sweeper`, `health/readiness` y `fault injection tests` cerrados; solo `Lifecycle state` (un estado formal más granular que `ExecutionRecord.status`/`stage`) permanece abierto, identificado para una iteración futura, sin bloqueo.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 94/94 verdes, incluyendo:
  - `workspace-sweeper.service.spec.ts`: `sweep()` reporta lo removido; `sweep()` nunca rechaza aunque `sweepExpired()` lance; con timers falsos, se programa en el intervalo configurado, se re-ejecuta periódicamente y `onModuleDestroy()` detiene la programación (verificado avanzando el reloj después de destruir y confirmando que no hay llamadas adicionales).
  - `execution-pipeline.service.spec.ts`: nuevo caso de fallo de `cleanup()` en sí mismo (ver arriba).
- `pnpm test:e2e`: 11/11 verdes (sin cambios de contrato HTTP en este incremento).

## Manejo de errores y seguridad

- El sweeper nunca opera fuera de la raíz administrada (reutiliza `WorkspaceManager.sweepExpired`, ya acotado); un fallo suyo no interrumpe ejecuciones en curso ni el resto del ciclo de vida del proceso.

## Observabilidad mínima

- Se registra cuántos workspaces huérfanos se removieron por corrida (solo cuando `>0`, para no generar ruido) y cualquier fallo del propio sweeper, sin rutas sensibles adicionales a las ya conocidas.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
