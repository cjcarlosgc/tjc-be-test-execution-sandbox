Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# WI-SANDBOX-014 · Revisión independiente

**Veredicto: APPROVED** (sin BLOCKER ni MAJOR; 3 MINOR).

## Criterios de aceptación
1. Default 4 -> 2 en código (`app/src/executions/execution-pipeline.service.ts:51,103,126`), spec 008 (`spec/features/008-reliability-lifecycle/spec.md:29`), `app/.env.example:52`, validación de entorno (`env.validation.ts:14` solo lista la clave; el default no vive allí; prueba nueva `env.validation.spec.ts:24-30`), pruebas (`execution-pipeline.service.spec.ts:284-339`) y `CHANGELOG.md:9`: CUMPLE.
2. Spec documenta e2-medium 2 vCPU/4 GB, contenedores de 1 GiB, ADR-10, latencia en cola como medida diagnóstica y no de calidad (tesis 3.3), y que el plazo global no cuenta la espera (`spec.md:29`): CUMPLE. `.env.example:49-51` y el comentario de la constante repiten la razón.
3. Lint, pruebas, build, contracts:check y 4 validadores: CUMPLE (ver comandos).

## Barrido de «4»
`git grep -nE "MAX_CONCURRENT|concurren" -- . ':!harness/reports' ':!harness/legacy' ':!spec/legacy'`: ningún «4» como default. Las demás coincidencias son ajenas (CI `concurrency`, contratos de otros servicios, backlog I-SANDBOX-005). Único «4» restante es la mención histórica «de 4 a 2» en el CHANGELOG.

## Pruebas: mutación manual
Cambié `DEFAULT_MAX_CONCURRENT_EXECUTIONS` a 4 y ejecuté `pnpm exec vitest run src/executions/execution-pipeline.service.spec.ts`: falla «usa 2 huecos por defecto…» con `expected { active: 3, waiting: 0 } to deeply equal { active: 2, waiting: 1 }`. Restaurado con `git checkout -- <archivo>`; `git status --short` vacío (0 líneas). Las pruebas ejercen comportamiento real (carga activa/en espera, estado `PENDING`, las 3 terminan `COMPLETED` con `failure=null` y `failureCode=null`).

## Contrato HTTP y deadline
- `git show ca57f89 --stat` no toca `spec/contracts`. `git diff 2abbaaa..HEAD -- spec/contracts` muestra solo `interoperability-contract.md` (§5 reintentos GET y nota de validación de esquemas), que es lo de WI-013 (2c524c1). Sin cambio de contrato; `contractImpact=false` correcto. El Sandbox no emite 429 por concurrencia (la cola es una promesa en `withSlot`, líneas 130-143).
- La espera no es fallo: la ejecución sigue en `PENDING` y no se asigna failure. `deadlineAt` se calcula en `execute()` (líneas 152-155) después de adquirir el hueco en `withSlot` (línea 111), por lo que la espera no consume `SANDBOX_EXECUTION_DEADLINE_MS`. Verificado por lectura de código.

## Override y validación
- Override: la prueba con `=1` (spec:261) y la nueva con `=3` (spec:319, `{active:3, waiting:0}`) pasan. `getNumberConfig` convierte strings de `.env`; `Math.max(1, floor(...))` protege el mínimo.
- Validación: `-1`, `1.5` y `abc` rechazados con mensaje que nombra la clave; `2` y entorno vacío aceptados; `0` ya se rechazaba (spec:33).

## Findings
- MINOR-1 `spec/features/008-reliability-lifecycle/tasks.md:4`: ST-SANDBOX-014 sigue `[ ]` / `T-IN_PROGRESS`. Esperable hasta el cierre; el leader debe pasarla a `[x]` / `T-DONE` al cerrar el WI (con `work-items.json` y `state.json`).
- MINOR-2 `execution-pipeline.service.spec.ts` (sin línea): no hay prueba que fije que la espera en cola no consume el deadline (el análisis SDD la marcó como opcional). La propiedad está en spec.md:29 y en código, pero sin guardia de regresión.
- MINOR-3 `execution-pipeline.service.spec.ts:319`: los overrides de pipeline se inyectan como número (`configOverrides`), no como string de entorno; la coerción string->número queda cubierta por `getNumberConfig`, no por esta prueba. Riesgo bajo.
- Observación (no hallazgo): el reporte del implementer indica que G-1 (aclaración del deadline) no se aplicó, pero el commit sí la incluye en spec.md:29; el reporte quedó desactualizado en ese punto.

## Blockers
Ninguno.

## Comandos (raíz del repo, `export PATH=$HOME/.local/node/bin:$PATH`)
- `node scripts/sdd-check.mjs` -> SDD check OK (exit 0)
- `node harness/validate-work-items.mjs` -> passed, 6 WI (exit 0)
- `node harness/validate-harness.mjs` -> passed (exit 0)
- `node harness/validate-completions.mjs` -> passed, 4 completed WI (exit 0)
- En `app/`: `pnpm lint` exit 0; `pnpm test` 34 files passed | 1 skipped, 309 tests passed | 4 skipped; `pnpm build` exit 0; `pnpm contracts:check` exit 0.
- Mutación y restauración como arriba; `git status` limpio antes de añadir este reporte.
