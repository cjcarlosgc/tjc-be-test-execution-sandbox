Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revisión independiente WI-SANDBOX-009 (CT-06/CT-07 con el cliente real de Core)

Veredicto: **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR). Revisado el commit 14ba991 (`git show HEAD`).

## Criterios
1. Test que importa el cliente real de Core y lo ejecuta contra el Sandbox por HTTP con Bearer y requestId UUID v5: CUMPLE. `app/src/executions/core-client.contract.spec.ts:84-100` importa dinámicamente `sandbox-execution.service.ts`, `sandbox-request-id.util.ts` y `map-sandbox-result.ts` de `../tjc-be-rag-core-api`; el Sandbox se sirve con `listen` en 127.0.0.1 (puerto efímero). Fakes solo en bordes (contenedor, descargas, ObjectStorageService, ConfigService). `fetch` solo se envuelve para registrar (y en CT-07 para redirigir la URL tras el reinicio). Aserta Bearer, Idempotency-Key, UUID v5 y esquema de la petición.
2. Caso feliz: CUMPLE (COMPLETED, facts, suitePath relativos, stages válidos, mapSandboxResult VALID, cero avisos `Contrato Core↔Sandbox`).
3. Fallo terminal: CUMPLE (SANDBOX_RESTARTED real vía FileExecutionRepository.onModuleInit; Core resuelve FAILED/INFRASTRUCTURE, una consulta de estado y una de resultado).
4. Omisión con aviso: CUMPLE (`core-client.contract.spec.ts:44-61`, `describe.skipIf`). Verificado con copia temporal apuntando a una ruta inexistente: 1 aviso emitido, 2 omitidos, sin error de carga; la copia se eliminó. No duplica los 16 tests de contract-real.
5. Reporte declara CT-06/CT-07 y desajustes (ninguno): CUMPLE (`wi-sandbox-009-implementation.md`).
6. Gates: CUMPLE (ver comandos).

## Mutaciones (aplicadas a src/ del Sandbox, restauradas con `git checkout -- src`)
- M1 suitePath absoluto (`/app/src/math.test.js`): el test feliz FALLA (aserción de suitePath).
- M2 stage inválido en la failure de SANDBOX_RESTARTED: CT-07 FALLA (esquema/advertencias de contrato).
- M3 código distinto de SANDBOX_RESTARTED: CT-07 FALLA.
- M4 categoría distinta de INFRASTRUCTURE: CT-07 FALLA.
Las aserciones no son tautológicas. `git status` limpio al final.

## Otros puntos
- Dependencias: sin cambios en package.json/lockfile. Core: `git status --short` idéntico antes y después (limpio).
- Refactor a `app/test/support/contract-real-sandbox.ts`: el diff de `executions.contract-real.spec.ts` solo borra imports/helper (hunks 1-308); los cuerpos de los 22 `describe/it` no cambian; 16/16 pasan.
- `executions.persistence.spec.ts`: fechas relativas a `Date.now()` dentro de la ventana de retención de 24 h; correcto y no flaky (5 ejecuciones consecutivas verdes con core-client).

## Hallazgos
- MINOR-1 `app/test/support/contract-real-sandbox.ts` (borde de descargas): `downloadToFile` pasa de devolver `'x'` a devolver el sha256 real y `verifyDownloads` es opcional; es un cambio de comportamiento del helper compartido (los 16 tests siguen verdes), solo declarado en el reporte.
- MINOR-2 `app/src/executions/file-execution.repository.spec.ts:12` y siguientes mantienen fechas fijas 2026-10-18; hoy pasan (el reloj se inyecta), pero conviene vigilar el mismo defecto latente de tiempo. No bloquea.
- Nota: `executions.contract-real.spec.ts` no cumple prettier en HEAD (preexistente, ya declarado).

## Comandos ejecutados (PATH con node en ~/.local/node/bin)
Raíz: `node scripts/sdd-check.mjs` (OK), `node harness/validate-work-items.mjs` (passed, 6 WI), `node harness/validate-harness.mjs` (passed), `node harness/validate-completions.mjs` (passed, 5 WI).
app/: `pnpm lint` (0 avisos), `pnpm test` (35 files passed, 1 skipped; 311 passed, 5 skipped), `pnpm build` (OK), `pnpm contracts:check` (OK).
Mutaciones: `pnpm vitest run src/executions/core-client.contract.spec.ts` tras cada mutación. Repetición: 5 corridas de core-client + persistence (6 passed, 1 skipped cada una).

Siguiente paso recomendado: cerrar el WI (W-DONE) según el harness.
