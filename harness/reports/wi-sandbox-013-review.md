Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revisión independiente WI-SANDBOX-013

Veredicto: **APPROVED** (0 BLOCKER, 0 MAJOR, 4 MINOR)

Alcance: `git diff 2abbaaa..HEAD` (2c524c1 spec/harness, 5cb91df código y pruebas). Ambos commits llevan `Refs: HU11`.

## Criterios de aceptación
1. Espejo y evento CS-CORE-20261018-003: CUMPLE. Digests system b70f9358…0444, interop b9ed40dc…ea05, árbol de esquemas c45e4513…1b31 coinciden; `cmp` de los dos .md y `diff -rq` de schemas contra `../tjc-be-rag-core-api/spec/contracts`: idénticos. No existe `github-integration-contract.md` local.
2. Acuse de -016 y resolución de eventos pendientes: CUMPLE. `contracts:check` pasa; los describe «C-06» y «C-07» de `executions.contract-real.spec.ts` actúan como CT-06/CT-07.
3. `executionProfile` en RunnerFacts, `stage` válido y request sin `phase`: CUMPLE (T1, T2, T3, T4). Mutaciones: ver más abajo.
4. Mapa de HU: CUMPLE. HU17 de `spec/backlog.md:42` es idéntica a la de Core; las 18 HU están presentes; las referencias a HU antiguas restantes están marcadas «legado SDD 2.1»/«antes HU»/«en SDD 2.1» (`009/tasks.md:14,32,36`, `009/spec.md:4,29`, `004/spec.md:23`).
5. Ideas diferidas: CUMPLE. I-SANDBOX-001…007 cubren m3–m6 y n1–n3 de `wi-sandbox-010-review.md` (m3 en dos ideas; n1/n2 juntas, n3 separada); I-SANDBOX-008 añade MINOR de WI-011/012 (extra, coherente).
6. Lint, tests, build, contracts:check y 4 validadores: CUMPLE.

## Eventos Contract Sync
- CS-CORE-20261018-003: justificado (espejo + evidencia + corrección suitePath).
- CS-CORE-20261009-016: justificado; `failureKind`, `phase` y los códigos ya existían en el código (verificado en el reporte de acuse y en T5-T8).
- CS-CORE-20261012-001 (DEC-INF-001): justificado; el espejo SYSTEM-2.13 contiene DEC-INF-001/002 (`system-contract.md:257,281`) y no hay cambio de código.

## Corrección de producción de suitePath
`app/src/runner-adapters/runner-result-paths.ts` + `execution-pipeline.service.ts:348` (`parseResult(rawResults, containerWorkingDir)`). Es correcta y segura. Probé 40 entradas adversas (script temporal, retirado):
- Absoluta bajo la raíz → relativa. `/app/apps/api/../../etc/passwd`, `/app/apps/api/src/../../x.ts`, `../../a.ts`, `src/../../a.ts` → solo nombre base.
- `C:\Users\...`, `d:/x/y.ts`, `\\host\share\a.ts`, `//host/share/a.ts` → nombre base. `/app/apps/apix/a.ts` (prefijo hermano) → no se trata como bajo la raíz.
- vacío, espacios, `null`, `undefined`, número, `/`, `.`, `..` → `null`. Raíz anidada (`/app/apps/api`), con barra final, con `..` o relativa → sin fuga ni ruta absoluta.
- Los fixtures con rutas del host (`/private/tmp/...`) terminan en nombre base, sin fuga de ruta del host.
- PHPUnit: nombres de clase relativos pasan sin cambio (`MathTest`, `Tests\Unit\MathTest` → `Tests/Unit/MathTest`). Prueba unitaria añadida. `containerRoot` es opcional y no cambia otros campos.

## Contract tests (executions.contract-real.spec.ts)
Prueban el pipeline real: HTTP Nest, guard, ValidationPipe, filtro, servicio, pipeline, extractor, materializador, adapters y parsers reales. Solo el contenedor, las descargas y la creación de directorios son fakes. La salida del runner viene de fixtures reales; las peticiones, de los ejemplos canónicos. Validan con `validateContract` contra el esquema espejado. No son tautológicos. Mutaciones manuales (restauradas con `git checkout`; `git status` limpio, sin stashes):
| Mutación | Resultado |
|---|---|
| parser Jest sin relativizar (`suite.name ?? null`) | 4 fallos (T1, T1b, T4, T7-Node) |
| `stage: 'BOGUS'` en la evidencia RUNNER_REPORT | 8 fallos |
| `executionProfile` incorrecto en facts | 1 fallo (T1) |
| pipeline sin pasar `containerWorkingDir` | 1 fallo (T1b) |

## Hallazgos
- MINOR-1 `app/src/runner-adapters/runner-result-paths.ts:44`: `isSafeRelativePath` no rechaza `\u0000`, y el esquema `RelativePath` lo prohíbe (`common.schema.json:12`). Un nombre de suite con NUL (`/app/apps/api/src/a\0.ts`) produce `src/a\0.ts`, que no valida. Solo con entrada adversaria del runner.
- MINOR-2 mismo archivo: `C:foo\a.ts` (unidad relativa) → `C:foo/a.ts`; `file:///app/...` → `file:/app/...` (ruta del contenedor, no del host); `a/` conserva la barra final. Todos válidos para el esquema; sin fuga del host. Endurecer es opcional.
- MINOR-3 `harness/reports/wi-sandbox-013-sdd-analysis.md:46`: afirma que `pollAfterMs` no se emite, lo que el reporte de implementación (sección 5.C) corrige: sí se emite en el 202. Informe de análisis obsoleto, sin efecto en el código.
- MINOR-4: el fallback a nombre base puede colapsar suites distintas del mismo nombre fuera de la raíz (por ejemplo `/x/a/a.test.ts` y `/y/b/a.test.ts`). Aceptable por seguridad; documentar como limitación. Las observaciones D del implementador (422 frente a 202 para profile/runner incompatibles; rama Jest `compiled=false` sin `TEST_COMPILATION_FAILED`) siguen abiertas y fuera del alcance de este WI.

## Comandos ejecutados
- Raíz: `node scripts/sdd-check.mjs` (OK), `node harness/validate-work-items.mjs` (OK, 6 WI), `node harness/validate-harness.mjs` (OK), `node harness/validate-completions.mjs` (OK, 3 WI).
- `app/`: `pnpm lint` (0), `pnpm test` (34 archivos pasan, 1 skip; 306 pasan, 4 skip), `pnpm build` (0), `pnpm contracts:check` (0).
- `shasum -a 256` de ambos .md, `cmp` contra Core, `diff -rq` de schemas; `git diff 2abbaaa..HEAD`; `grep` de HU antiguas; prueba adversa temporal con vitest (borrada); mutaciones con `sed` y `git checkout`.
