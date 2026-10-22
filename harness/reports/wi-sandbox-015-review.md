Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# WI-SANDBOX-015 — Revisión independiente

**Veredicto: APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR).

## Criterios
1. Espejo: `interoperability-contract.md` sha256 22b880d1…e311 y `system-contract.md` b70f9358…0444 (`cmp` OK contra `../tjc-be-rag-core-api/spec/contracts`); `diff -r` de `schemas/` sin diferencias; digest del árbol a1ba9a19…9091 en ambos lados. No existe `github-integration-contract.md` en el Sandbox. Solo se importó CS-CORE-20261021-003. CUMPLE.
2. `git diff HEAD~1 -- app/src/contracts/generated`: las únicas líneas eliminadas son 3 descripciones del ErrorEnvelope (+ comentarios); el resto es el bundle de realtime-events (incluye `executionProfile` en la zona realtime, líneas ~220 de contract-types.ts, antes de `sandbox-execution`). La sección sandbox-execution no cambia. `contracts:check` pasa; con una mutación en copia (`// drift`) devuelve rc=1 y restaurado rc=0. El Sandbox no usa Socket.IO (los tipos realtime no se importan). CUMPLE.
3. C-06/C-07 y el test con cliente real de Core (WI-009) pasan dentro de `pnpm test` (319 passed, 5 skipped, 36 archivos + 1 skipped). El comportamiento observable no cambia salvo 413. CUMPLE.
4. Fix 413 (`app/src/common/http/http-exception.filter.ts:84-91,101-108`): correcto y mínimo (rama nueva tras `HttpException`, antes del 500; no toca otros códigos). Mensaje fijo, `details: null`, sin reflejar el texto crudo (verificado por prueba). Casos adversos probados en copia: Error sin `type` → 500; `status:'413'` (string) → 500; objeto arbitrario, `null`, `undefined`, string, número → 500; `{status:413}` objeto no-Error → 413; Error con status 500 y type ajeno → 500; `HttpException(413)` → 413 con su mensaje original (sin cambio); `HttpException(400)` → VALIDATION_ERROR; `HttpException(500)` → HTTP_ERROR. CUMPLE.
5. Pruebas nuevas (`http-exception.filter.generic.spec.ts`): no tautológicas (validan contra el esquema real, ausencia de `retryable`, código esperado, mensaje fijo y no fuga de texto). Mutación (`false && isBodyTooLarge` en una copia): fallan exactamente las 2 pruebas 413 de body-parser (2 failed, 6 passed). CUMPLE.
6. Evento CS-CORE-20261021-003: `status: C-RESOLVED` con acuse y evidencia, `breaking:false` para el Sandbox, justificado (nombres genéricos ya coinciden, `sandbox-execution` sin cambio, el filtro conserva códigos propios). CUMPLE.
7. e2e en copia temporal sin `app/.env` (rsync excluyendo node_modules, dist, .env, .git; node_modules enlazado; copia borrada): `pnpm test:e2e` rc=0, 15 passed, 6 skipped (Docker no disponible), 2 archivos passed, 1 skipped. Los fallos con el `.env` del usuario son ambientales. No se leyó ni se tocó `app/.env`.
8. Gates: `scripts/sdd-check.mjs` OK; `harness/validate-work-items.mjs` OK (7 WI); `validate-harness.mjs` OK; `validate-completions.mjs` OK (6 WI); en `app/`: `pnpm lint` rc=0, `pnpm test` verde, `pnpm build` rc=0, `pnpm contracts:check` rc=0.

## Hallazgos
- MINOR 1 — `app/src/common/http/http-exception.filter.ts:107`: cualquier objeto no-Error con `status`/`statusCode === 413` se trata como cuerpo grande; es deliberado (compatible con body-parser/http-errors) y sin riesgo observable. Sin acción.
- MINOR 2 — `http-exception.filter.generic.spec.ts:105-119`: el caso 405 documenta `HTTP_ERROR` (el filtro no emite `METHOD_NOT_ALLOWED`); permitido por `code` abierto de INTEROP-2.18, pero si Core quisiera el código exacto sería un WI aparte.

## Comandos
`shasum`, `cmp`, `diff -r`, digest del árbol (receta del evento); `git show HEAD`, `git diff HEAD~1 -- app/src/contracts/generated`; en `app/`: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm contracts:check`; raíz: `node scripts/sdd-check.mjs`, `node harness/validate-{work-items,harness,completions}.mjs`; en copia temporal: pruebas adversas, mutación del filtro, mutación de drift, `pnpm test:e2e`. `git status` limpio antes de escribir este reporte; ../tjc-be-rag-core-api y app/.env intactos.
