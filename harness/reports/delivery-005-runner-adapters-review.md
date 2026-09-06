# Revisión de work item — 005-test-runner-adapters

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU14, HU19 (`spec/features/005-test-runner-adapters/spec.md`).
- Sin decisiones `PENDING` bloqueantes: la feature normaliza Jest/Vitest a un resultado común y verifica `runnerHint` contra config/dependencias ya presentes en el snapshot — distinto de la detección del package manager que sí bloquea `DEC-SBX-002`.
- Implementado:
  - `TestRunnerAdapter` (interfaz): `supports`, `buildCommand`, `parseResult`.
  - `JestTestRunnerAdapter` / `VitestTestRunnerAdapter`: `supports()` detecta el runner por `package.json` (`dependencies`/`devDependencies`) o archivo de config (`jest.config.*` / `vitest.config.*`), sin instalar nada. `buildCommand()` construye el argv (`node_modules/.bin/jest --ci --json --outputFile=...` / `node_modules/.bin/vitest run --reporter=json --outputFile=...`) — no se ejecuta todavía; queda listo para cuando `004`/`DEC-SBX-002` permitan instalar dependencias y correr el comando real.
  - `parseJestCompatibleJson`: parser único para ambos (Vitest mantiene el mismo esquema JSON que Jest deliberadamente) → `RunnerFacts`/`TestCaseFact`. Nunca infiere éxito por texto; un estado de assertion desconocido se clasifica `FAILED`, nunca `PASSED` por omisión. `compiled=false`/`executed=false` cuando una suite no produjo `assertionResults` (error de sintaxis/runtime).
  - `RunnerAdapterRegistry.resolve(runnerHint, context)`: selecciona el adapter y verifica `supports()`; una incompatibilidad lanza `UnsupportedRunnerError` (`UNSUPPORTED_RUNNER`/`CONFIGURATION`, vocabulario de `INTEROP-1.1` §7.4).
  - **Integración con `001`/`002`/`003`:** `ExecutionPipelineService` invoca `RunnerAdapterRegistry.resolve` justo después de materializar artefactos, cerrando la verificación de `runnerHint` que `001-execution-api` había dejado explícitamente diferida. Una incompatibilidad produce un resultado terminal `FAILED` factual (y limpia el workspace, igual que cualquier otro fallo de `PREPARING`); una coincidencia deja la ejecución en `PREPARING` como antes (instalar/compilar/ejecutar sigue bloqueado por `DEC-SBX-002`).
- **Fixtures de outputs reales:** generadas ejecutando Jest 29 y Vitest 2 de verdad (proyectos descartables fuera del repo) contra un caso mixto (una prueba pasa, otra falla), un caso 100% verde y un caso de error de sintaxis real (`SyntaxError` de Jest, `numRuntimeErrorTestSuites`); archivos JSON reales committeados en `src/runner-adapters/fixtures/`.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 86/86 verdes, incluyendo:
  - `jest-compatible-result-parser.spec.ts`: 5 fixtures reales (mixto/100% verde × Jest/Vitest, error de sintaxis Jest) + JSON inválido + estado de assertion desconocido nunca tratado como éxito.
  - `jest-test-runner.adapter.spec.ts` / `vitest-test-runner.adapter.spec.ts`: detección por dependencia declarada, por archivo de config, ausencia de señal, y argv exacto de `buildCommand`.
  - `runner-adapter-registry.spec.ts`: resuelve el adapter correcto; rechaza con `UnsupportedRunnerError` ante incompatibilidad.
  - `execution-pipeline.service.spec.ts`: nuevo caso — incompatibilidad de runner produce `FAILED`/`UNSUPPORTED_RUNNER`/`CONFIGURATION` y limpia el workspace.
- `pnpm test:e2e`: 9/9 verdes (se agregó un caso real de punta a punta: descarga HTTPS real de un snapshot que declara `vitest`, `runnerHint=JEST` solicitado a propósito → `FAILED` con `UNSUPPORTED_RUNNER`/`CONFIGURATION` consultable en `GET /result`). Se ajustó el fixture del snapshot del test de materialización (agregó `devDependencies.vitest`) porque, al quedar conectada la verificación de `runnerHint`, un proyecto sin runner declarado ahora falla correctamente después de materializar — comportamiento nuevo y esperado, no una regresión.

## Manejo de errores y seguridad

- `parseJestCompatibleJson` nunca ejecuta código del reporte ni evalúa el JSON como JS (`JSON.parse` estricto); un output no-JSON produce `InvalidArchiveError` (`INVALID_ARCHIVE`/`CONFIGURATION`), no una excepción no controlada.
- `supports()` solo lee `package.json` y nombres de archivo de config ya materializados en el workspace; no ejecuta `npm`/`pnpm`/`yarn` ni ningún binario del proyecto.

## Observabilidad mínima

- La incompatibilidad de runner se registra mediante el log de fallo ya existente en `ExecutionPipelineService` (`code`/`message`, sin contenido del proyecto ni de los reportes).

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
