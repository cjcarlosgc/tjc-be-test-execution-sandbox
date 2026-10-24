Modelo: implementer-high · configurado claude-haiku-5-5 · atendido unknown · esfuerzo high (escalado desde implementer: persistencia con seguridad y recarga, no es cambio mínimo)

# WI-SANDBOX-010 — Implementación (persistencia en disco del estado de ejecuciones)

Fecha: 2026-10-18. Corte único. Contrato HTTP sin cambios (`contractImpact: false`).

## Qué se hizo (app/)
- `RetainedExecutionRepository` (abstracta) en `execution.repository.ts` con índices, retención y hooks `persist`/`onEvicted`; `InMemoryExecutionRepository` es subclase sin cambios de API.
- `FileExecutionRepository` (`file-execution.repository.ts`): `<SANDBOX_EXECUTION_STATE_DIR>/<executionId>.json`, escritura atómica (temporal + fsync + rename), directorio 0700 y archivos 0600; `save` nunca lanza; recarga en `onModuleInit`.
- `execution-state.codec.ts`: serializador por lista blanca (sin `snapshot`, `artifacts`, `projectRoot`, URLs ni rutas), deserializador con validación, y `markInterruptedAsRestarted` (FAILED / `SANDBOX_RESTARTED` / `INFRASTRUCTURE`).
- Defensas de recarga: nombre `<uuid>.json`, `executionId` coincidente, sin symlinks, tope de 4 MiB, JSON/forma/`schemaVersion` inválidos ignorados con aviso, temporales huérfanos borrados.
- Configuración: `SANDBOX_EXECUTION_STATE_DIR` (default `~/.tjc-sandbox/executions`, nunca `os.tmpdir()`), validada como ruta absoluta; `.env.example` y comentarios obsoletos corregidos; los e2e fijan un directorio temporal propio.

## Pruebas
+36 pruebas (codec 16, repositorio de archivos 14, persistencia vía `ExecutionsService` 4, entorno 2): recarga tras reinicio, idempotencia (mismo `executionId` sin `pipeline.run`; 409 con huella distinta), archivos corruptos, retención en memoria y disco, ejecución en curso → `SANDBOX_RESTARTED` con `GET /result` 200, ausencia de URLs/`projectRoot`/rutas en disco, permisos y fallo de escritura.

## Verificación (leader, reproducida de forma independiente, desde `app/`)
- `pnpm lint` → ok; `pnpm test` → 33 archivos, 264 pasan, 4 omitidos (base 228); `pnpm build` → ok; `pnpm contracts:check` → ok.
- Pendiente fuera del WI: `pnpm test:e2e` requiere Docker (no disponible en esta sesión). Pre-existente: `tsc --noEmit -p tsconfig.json` falla en `execution-pipeline.service.spec.ts:892-893` y `executions.contract.spec.ts:96` (no afecta build ni vitest).
