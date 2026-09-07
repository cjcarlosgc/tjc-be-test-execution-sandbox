# Revisión de work item — endurecimiento transversal (deadline global + OOM)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU23/HU24 (capacidad técnica transversal, sin HU dedicada propia).
- Contexto: el usuario agregó `tasks.md` a seis specs transversales (`timeouts-cleanup`, `observability`, `errors`, `container-isolation`, `temporary-workspaces`, `resource-limits`) que antes no tenían checklist propio, aunque sus capacidades ya estaban parcialmente implementadas dispersas entre `002`/`004`/`008`. Se revisó cada ítem de cada `tasks.md` contra el código real.
- Hallazgos genuinos (resto ya cubierto por trabajo previo):
  1. **Sin deadline global.** Existían timeouts por etapa (`SANDBOX_INSTALL_TIMEOUT_MS`/`SANDBOX_TEST_TIMEOUT_MS`) pero ningún techo agregado sobre la ejecución completa — una ejecución con instalación lenta pero dentro de su propio timeout, seguida de un test también dentro del suyo, podía sumar un tiempo total arbitrariamente largo.
  2. **Sin normalización de OOM.** Un container matado por el kernel por exceder memoria (`State.OOMKilled`) se reportaba igual que cualquier otro exit code no-cero (`DEPENDENCY_INSTALL_FAILED`/`TEST_EXECUTION_FAILED` genérico), sin distinguir un límite de plataforma de un fallo lógico del proyecto.
- Todo lo demás (Docker security options, mount/network policy, Zip Slip, sweeper, error model, HTTP mapping, redaction/truncation) ya estaba implementado y probado en entregas previas; se verificó explícitamente contra cada ítem, no se asumió.

## Cambios

- `common/config/sandbox-limits.config.ts`: nuevo `executionDeadlineMs` (`SANDBOX_EXECUTION_DEADLINE_MS`, default 10 min).
- `executions/execution-pipeline.service.ts`: calcula `deadlineAt` al iniciar; `assertWithinDeadline` corta con `TIMED_OUT`/`EXECUTION_DEADLINE_EXCEEDED` antes de arrancar `INSTALLING_DEPENDENCIES`/`RUNNING_TESTS` si ya no queda presupuesto; pasa `deadlineAt - Date.now()` como `maxTimeoutMs` a `ContainerRunner`, que nunca puede ampliar su propio timeout configurado, solo acotarlo más.
- `container/container-runner.service.ts`: `installDependencies`/`runTestCommand` aceptan `maxTimeoutMs` opcional (`clampTimeout`); `ContainerRunResult` gana `oomKilled: boolean` leído de `container.inspect().State.OOMKilled`.
- `common/errors/sandbox-fact-error.ts`: nuevo `OomKilledError` (`OOM_KILLED`/`INFRASTRUCTURE`), verificado en el pipeline antes que el chequeo de exit code genérico.
- Seis `tasks.md` transversales actualizados con el detalle de qué cubre cada ítem y dónde; `observability/tasks.md` deja "metrics" explícitamente sin marcar con la justificación de por qué no corresponde inventar un endpoint no solicitado por ninguna spec de comportamiento; `resource-limits/tasks.md` documenta la limitación real de `HostConfig.DiskQuota` con el storage driver `overlay2`.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 114/114 verdes. Nuevo en `execution-pipeline.service.spec.ts`: OOM durante install, OOM durante test, deadline global ya agotado antes de instalar (verifica que `installDependencies` ni siquiera se llama). Nuevo en `container-runner.service.spec.ts`: `oomKilled` reportado desde `inspect()`, `maxTimeoutMs` efectivamente acota el timeout aunque el configurado sea mucho mayor (verificado por duración real de la llamada).
- `pnpm test:e2e`: 16/16 verdes, incluyendo Docker real. Nuevo: caso que envía `timeoutMs`/`memoryBytes`/`cpuLimit` en el body y confirma `400 VALIDATION_ERROR` (el `ValidationPipe` los rechaza como campos desconocidos antes de llegar a ningún controller).

## Manejo de errores y seguridad

- El deadline global nunca puede ser *ampliado* por una etapa individual (`clampTimeout` usa `Math.min`), y ninguno de estos límites es controlable por el request de Core (siguen siendo exclusivamente `ConfigService`).
- `OOM_KILLED` usa categoría `INFRASTRUCTURE` (límite de plataforma), distinta de `DEPENDENCY`/`TEST_RUNTIME`, dándole a Core una señal más precisa para su propia clasificación de `FailureType`.

## Observabilidad mínima

- `ContainerRunner` ahora registra `oomKilled` en cada línea de log de `installDependencies`/`runTestCommand`, sin registrar contenido de stdout/stderr.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
