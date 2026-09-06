# Revisión de work item — pipeline real (004 resto + 005 conectado + 006 + 007)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU23.
- Decisión resuelta por el usuario (humana, no inventada): `DEC-SBX-002` → `APROBADO`. V1 soporta únicamente `pnpm` en los proyectos ejecutados, detectado por `pnpm-lock.yaml`; instalación vía `corepack pnpm@<versión fijada por SANDBOX_PNPM_VERSION>` (nunca el campo `packageManager` del proyecto — en la práctica trae rangos como `^9.0.0` que corepack rechaza por no ser semver exacto, verificado empíricamente); red acotada solo a la instalación, compilación/tests sin red (ya aprobado en `architecture.md`).
- Implementado:
  - **`ContainerRunner`** generalizado: `runSmokeCheck` (ya existente), `installDependencies` (mount read-write, `NetworkMode: bridge`, comando `corepack pnpm@<v> install --frozen-lockfile`) y `runTestCommand` (mount read-write, `NetworkMode: none`, argv del `TestRunnerAdapter` resuelto). `collectLogs` ahora reporta `stdoutTruncated`/`stdoutOriginalBytes`/`stderrTruncated`/`stderrOriginalBytes` reales (no solo el contenido cortado).
  - **`hasPnpmLockfile`** (`src/container/package-manager-detection.ts`): única señal de soporte de package manager, coherente con `DEC-SBX-002`.
  - **`ExecutionPipelineService`** encadena el pipeline completo: `PREPARING` → (`DEC-SBX-002` check) → `INSTALLING_DEPENDENCIES` → `RUNNING_TESTS` → `COMPLETED`/`FAILED`/`TIMED_OUT`. Cada transición actualiza `status`+`stage` para polling en tiempo real. Nuevos errores factuales: `UnsupportedPackageManagerError` (`UNSUPPORTED_PACKAGE_MANAGER`/`CONFIGURATION`), `DependencyInstallFailedError` (`DEPENDENCY_INSTALL_FAILED`/`DEPENDENCY`, exit code + stderr truncado), `TestExecutionFailedError` (`TEST_EXECUTION_FAILED`/`TEST_RUNTIME`, cuando el runner no produce reporte), `SandboxTimeoutError` (marca `status=TIMED_OUT` en vez de `FAILED`, distinguido por `instanceof`). Un test que corre pero falla es `COMPLETED` con `facts.passed=false`: el Sandbox nunca calcula `valid`/`FailureType` (interoperability-contract §7.3), solo hechos.
  - **006-execution-results:** `RunnerFacts` poblado por el parser real de `005`; `stageDurations` con duración medida por etapa; `evidence` con `TEST_STDOUT`/`TEST_STDERR` (siempre) y `RUNNER_REPORT` (el JSON crudo del runner, acotado a 8 KiB) — no existe evidencia `COMPILER_*` porque no hay etapa `COMPILING` separada (Jest/Vitest transpilen TypeScript al vuelo; un fallo de compilación se refleja en `facts.compiled=false`, decisión de diseño documentada en `004/tasks.md`).
  - **007-batch-validation:** el Sandbox no distingue un "manifest" adicional — `record.artifacts` ya es el conjunto final del run, aplicado completo por `ArtifactMaterializer` antes de instalar/ejecutar (verificado con un artefacto `MODIFIED` real que efectivamente cambia el resultado de una prueba).
- Fuera de alcance (correctamente): mutation score (`DEC-MET-001` PENDING, no bloquea), soporte de npm/yarn (decisión humana explícita: solo pnpm), validación empresarial real (`DEC-VAL-001`).

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 106/106 verdes. Nuevo: `package-manager-detection.spec.ts`; `container-runner.service.spec.ts` ampliado (install/test commands, mount/network correctos, truncamiento con `originalBytes` real); `execution-pipeline.service.spec.ts` reescrito con workspace real en disco (14 casos: éxito COMPLETED con facts, fallo de descarga, cleanup que falla sin ocultar el resultado, error inesperado, artefactos aplicados, runner incompatible, **sin pnpm-lock.yaml → UNSUPPORTED_PACKAGE_MANAGER**, **install falla → DEPENDENCY**, **timeout de install → TIMED_OUT**, **timeout de test → TIMED_OUT**, **runner sin reporte → TEST_EXECUTION_FAILED**, **test que falla → COMPLETED con passed=false**, mensaje de error truncado, no-op si la ejecución desapareció).
- `pnpm test:e2e`: 13/13 verdes, incluyendo dos pruebas nuevas **reales de punta a punta** (`full-pipeline.e2e-spec.ts`, se omiten automáticamente si Docker no está accesible) contra un fixture real committeado (`test/fixtures/vitest-sample-project/`, generado ejecutando `pnpm install`/Vitest de verdad): descarga HTTPS real → extracción real → `pnpm install` real con red dentro de Docker → `vitest run` real sin red dentro de Docker → `COMPLETED` con `facts` reales (una corrida 100% verde, otra con un artefacto `MODIFIED` real que hace fallar una prueba, verificando `facts.passed=false` y `appliedArtifactIds`). Se ajustó `executions.e2e-spec.ts`: su fixture minimal (sin `pnpm-lock.yaml`) ahora falla correctamente con `UNSUPPORTED_PACKAGE_MANAGER` en vez de quedarse en `PREPARING` (comportamiento nuevo y esperado, no una regresión); la cobertura de descarga+extracción+materialización real de punta a punta ya la da `full-pipeline.e2e-spec.ts` con un proyecto instalable de verdad.
- **Hallazgo real durante la verificación:** las pruebas con Docker mock pasaban pero el pipeline real fallaba con `TEST_EXECUTION_FAILED` (el runner no producía el reporte). Causa: `resultsFilePath` se calculaba como ruta del host y se pasaba tal cual a `buildCommand`, pero el comando corre dentro del container donde el workspace está montado en `/app`, no en la ruta del host. Se corrigió separando `resultsFilePath` (ruta `/app/...` que ve el comando) de `hostResultsFilePath` (la misma ruta en disco, usada para leer el reporte después). Ningún test con mocks lo detectaba porque todos simulaban la escritura directamente en la ruta de host — la prueba e2e real con Docker fue la que lo expuso.

## Manejo de errores y seguridad

- `installDependencies` monta el workspace de lectura-escritura con red (`bridge`); `runTestCommand` monta lectura-escritura sin red (`none`) — igual que antes, sin privilegios, `CapDrop: ALL`, `no-new-privileges`, sin Docker socket.
- El exit code del comando de test **no** determina `FAILED`/`COMPLETED`: un exit code 1 de Vitest por pruebas fallidas es normal (`COMPLETED` con `facts.passed=false`); solo la ausencia/invalidez del reporte JSON es un fallo de Sandbox (`TEST_EXECUTION_FAILED`). El exit code del **install** sí determina fallo, porque no hay concepto de "reporte parcial exitoso" para `pnpm install`.
- Mensajes de error truncados (stderr de install limitado a 500 caracteres) para no filtrar logs completos del proyecto en el `SandboxFailureFact.message`.

## Observabilidad mínima

- `ExecutionPipelineService` registra la etapa donde ocurre cada fallo (`FAILED during INSTALLING_DEPENDENCIES: ...`) y `COMPLETED` con `runner`/`passed`/`totalTests`. `ContainerRunner` registra cada invocación (install/test) con `exitCode`/`timedOut`/`durationMs`, nunca el contenido de stdout/stderr en el log.

## Hallazgos

Ninguno abierto (el hallazgo real de `resultsFilePath` descrito arriba fue corregido y re-verificado antes de este veredicto).

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
