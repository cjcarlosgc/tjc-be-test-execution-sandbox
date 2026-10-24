Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-015 — Análisis SDD (INTEROP-2.18, CS-CORE-20261021-003)

Veredicto: **SPEC_VERIFIED** (con un cambio obligatorio: regenerar tipos; sin cambio de código de producción).

## 1. Digests (verificados)
- interoperability-contract.md = 22b880d1…e311 (coincide). system-contract.md = b70f9358…0444 (coincide). Árbol schemas = a1ba9a19…9091 (coincide).
- Cabecera INTEROP-2.18: interoperability-contract.md:14.

## 2. Qué cambia para el Sandbox
- error-envelope.schema.json: solo `description` de `code`, `message` y `retryable` (git diff; sin cambio de tipo/required). `code` sigue `string` minLength 1 (abierto).
- Nuevos realtime-events.schema.json + 6 ejemplos realtime + error-envelope.generic.json: solo Core↔Console (§6.6). El Sandbox no usa Socket.IO.
- Generador app/scripts/generate-contract-types.mjs:21-22 lee TODOS los `*.schema.json` del directorio (no filtra), por lo que genera tipos y bundle de más (SubscribeAck, AnalysisRunStatus, SubscribeProjectVersionPayload, …) en contract-types.ts/contract-schemas.ts (+177/-6 y +518 líneas en prueba de regeneración).
- `pnpm contracts:check` HOY FALLA (rc=1: DESACTUALIZADO contract-types.ts y contract-schemas.ts) -> hay que ejecutar `contracts:generate` y commitear app/src/contracts/generated/*. Verificado regenerando y revirtiendo (el árbol quedó intacto).
- Los tipos extra son inofensivos (no se importan salvo ErrorEnvelope/§7). Se acepta; no modificar el generador (alcance mínimo). Verificar que `tsc`/lint pasen con los tipos nuevos (no probado).
- Validación de ejemplos/manifest: executions.contract.spec.ts:18-20 y test/support/contract-real-sandbox.ts:67 cargan ejemplos por nombre; no iteran el directorio ni el manifest.json (grep sin coincidencias de lectura de manifest). Los ejemplos nuevos no deberían romperlos; confirmar corriendo la suite.

## 3. §4.1 vs Sandbox
- Tabla §4.1: interoperability-contract.md:85-103; `retryable`: :110.
- app/src/common/http/http-exception.filter.ts:14-23 DEFAULT_CODE_BY_STATUS: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, PAYLOAD_TOO_LARGE, UNPROCESSABLE_ENTITY, TOO_MANY_REQUESTS (nombres idénticos a §4.1); fallback `HTTP_ERROR` (:69) y `INTERNAL_ERROR` para no-HTTP (:76). Ningún código genérico del Sandbox está fuera de la lista.
- Carencias vs §4.1 (no son desvíos contractuales; el contrato dice «los nombres se alinean con los genéricos de Test Execution Sandbox», :112, y `code` es abierto):
  - 405, 406, 415 y 503 caen en `HTTP_ERROR` en el Sandbox (sin METHOD_NOT_ALLOWED/NOT_ACCEPTABLE/UNSUPPORTED_MEDIA_TYPE/SERVICE_UNAVAILABLE). §4.1 es la tabla de Core (:87 «se traduce en Core»); el Sandbox no está obligado. 5xx HttpException tampoco mapea a INTERNAL_ERROR (usa HTTP_ERROR). Cambio opcional, NO requerido por los criterios del WI («no cambia su comportamiento observable»).
  - 400: Sandbox emite `VALIDATION_ERROR` (filter:15; executions.service.ts:174-222), no `INVALID_REQUEST` de Core (:108). Es un código explícito del Sandbox, permitido por `code` abierto; Core lo trata como abierto. Sin cambio.
- `retryable`: NO obligatorio para el Sandbox. Citas: :66 («opcional; GitHub lo emite en todos…; Core solo en los genéricos»), :110 («es opcional en el esquema… el consumidor no debe asumir reintento»). El Sandbox no lo emite (filter.ts:44-52) y las pruebas lo exigen ausente (executions.contract-real.spec.ts:111,117,122,321). Mantener.

## 4. Cobertura de pruebas
Existentes: ErrorEnvelope válido contra el esquema para 400 (contract-real.spec.ts:57-97, e2e 186/203), 401 (:122), 404 EXECUTION_NOT_FOUND/409 (:313-324; contract.spec.ts:92-115). C-06/C-07 y cliente real WI-009 en executions.contract-real.spec.ts / test/support/contract-real-sandbox.ts.
Faltan (opcionales, recomendadas, bajo costo): un test genérico que valide con `error-envelope.schema.json` (a) 404 de ruta inexistente -> `code: 'NOT_FOUND'`, (b) 405 -> `HTTP_ERROR` (o el que se decida), (c) 413 body excesivo -> `PAYLOAD_TOO_LARGE` si el parser lo produce; y que `retryable` está ausente. No hay prueba que fije hoy los códigos genéricos del filter (sin test unitario del HttpExceptionFilter).

## DEC / Blocks
DEC-ERR-001 PROPOSED, Blocks NONE (CS-CORE-20261021-003 `changed`; DEC-RT-001 es de Core). Ninguna DEC con Blocks aplica al Sandbox. Confirmado.

## Lista exacta para el implementer
1. `cd app && export PATH=$HOME/.local/node/bin:$PATH && pnpm contracts:generate`; revisar diff (solo descripciones de ErrorEnvelope + sección realtime-events); `pnpm contracts:check` en verde.
2. Sin cambio en app/src de producción (filter, DTOs).
3. (Recomendado) añadir pruebas de envelope genérico 404 ruta inexistente / 405 / (413 si aplica) con validación de esquema en app/test o executions.contract.spec.ts; sin cambiar códigos.
4. Reejecutar lint, unit, e2e, build, contracts:check, C-06/C-07 y test WI-009 (cliente real), y los 4 validadores de harness.
5. Acuse/resolución del evento con reporte (ya existe harness/reports/contract-sync-cs-core-20261021-003-acknowledgement.md); no espejar github-integration-contract.md.

## Cierre del leader
Sin huecos de spec. Cambio de código esperado: solo regenerar los tipos (`contracts:generate`) y, opcionalmente, pruebas de errores genéricos (404 de ruta inexistente, 405, 413) validadas contra el esquema. Veredicto: **SPEC_VERIFIED**; `contractImpact: true` (espejo); sin decisión bloqueante (DEC-ERR-001 PROPOSED con Blocks NONE).
