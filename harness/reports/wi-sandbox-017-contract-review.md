Modelo: contract-reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-017 · Revisión contractual (SYSTEM-2.14 / INTEROP-2.19)

**Veredicto: APPROVED**

## 1. Espejo
- `cmp spec/contracts/system-contract.md ../tjc-be-rag-core-api/spec/contracts/system-contract.md` -> idéntico.
- `cmp spec/contracts/interoperability-contract.md ../tjc-be-rag-core-api/spec/contracts/interoperability-contract.md` -> idéntico.
- `shasum -a 256`: system f60d6c4b...96ce3 y interop f9866d16...c6f9, ambos coinciden con los esperados.
- Árbol `spec/contracts/schemas` (`find . -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256`) = a1ba9a19...9091, sin cambio. `git status` no muestra cambios en schemas.
- El Sandbox no tiene github-integration-contract.md (`ls spec/contracts`: solo los dos contratos y schemas).

## 2. Delta y comportamiento del Sandbox
`git diff -U0 -- spec/contracts` muestra solo:
- Cabeceras de versión (INTEROP-2.19, SYSTEM-2.14, fecha 2026-10-21).
- Nota de versión en §1.
- Texto de §6.5 y §6.5.1 (Core): modelo y esfuerzo del LLM, y `422 REASONING_EFFORT_UNSUPPORTED` / `503 LLM_PROVIDER_UNAVAILABLE` en la creación de experimentos de Core.
- Nueva DEC-EXP-005 (Blocks: NONE) en system-contract.

Los encabezados `##` y `###` de INTEROP no cambian. §3, §4, §4.1, §5, §7 y §10 y los schemas no tienen diff. DEC-EXP-005 declara "Sin cambio de rutas, DTO, enums ni códigos de error".
Las variables `LLM_*` y `EXPERIMENT_LLM_*` son de Core. `grep -rliE "LLM_|reasoning|EXPERIMENT_LLM|gpt-" app scripts .github` solo coincide en `app/src/contracts/generated/*`, `app/dist/contracts/generated/*` y un `.md` dentro de `node_modules` (undici). Ningún código de `app/src` fuera de los tipos generados usa el LLM. Los tipos generados provienen de schemas sin cambio, así que no hay regeneración pendiente.
`git diff --stat -- app` está vacío. Sin impacto en rutas, DTO, errores, auth, idempotencia ni en el esquema sandbox-execution.
El comportamiento actual (homologado en INTEROP-2.18, WI-SANDBOX-015) sigue consistente con INTEROP-2.19 §3, §4, §4.1, §5, §7 y §10, porque esas secciones no cambian.

## 3. spec/features vs. contrato
No hay contradicciones. `spec/features/**` no menciona LLM ni DEC-EXP-004/005. Las referencias a `INTEROP-2.1`, `SYSTEM-2.2` o `INTEROP-2.8` son históricas o de línea base y no afirman ser la versión vigente.
`tasks.md` ya tiene ST-SANDBOX-017 como T-READY (diff +2 líneas).

## Hallazgos
- BLOCKER: ninguno.
- MAJOR: ninguno.
- MINOR: ninguno. Nota informativa: el system-contract dice que los espejos de GitHub Integration y Console siguen en SYSTEM-2.13 hasta su homologación; no afecta al Sandbox.
