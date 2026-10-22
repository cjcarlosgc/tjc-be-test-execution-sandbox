Modelo: contract-reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-015 · Revisión contractual (INTEROP-2.18)

Veredicto: **APPROVED** (sin BLOCKER ni MAJOR; 2 MINOR informativos).

## 1. Espejo
Comandos: `cmp` de interoperability y system contra ../tjc-be-rag-core-api/spec/contracts (idénticos); `diff -r spec/contracts/schemas ../tjc-be-rag-core-api/spec/contracts/schemas` (sin diferencias); `shasum -a 256`.
- interoperability 22b880d1...e311 OK; system b70f9358...0444 OK; árbol schemas a1ba9a19...9091 OK.
- `ls spec/contracts`: solo interoperability, system y schemas; no hay github-integration-contract.md (confirmado, el Sandbox no lo espeja).

## 2. Contrato HTTP del Sandbox
- `git diff --stat` sobre sandbox-execution.schema.json: vacío (no cambió). Rutas, DTOs, auth, idempotencia (§3,5,7,10) sin delta.
- Delta de §4/§4.1 es documental sobre Core (`AllExceptionsFilter`); §4 sigue diciendo que `code` es string abierto y que Sandbox devuelve la misma forma.
- MINOR-1 (informativo, no incumplimiento): app/src/common/http/http-exception.filter.ts:15-23,82-87 mapea genéricos solo para 400(`VALIDATION_ERROR`),401,403,404,409,413,422,429, resto `HTTP_ERROR`; 500 `INTERNAL_ERROR`. Frente a la tabla §4.1 (normativa para Core; "los nombres se alinean con los genéricos de Sandbox"): faltan 405 METHOD_NOT_ALLOWED, 406 NOT_ACCEPTABLE, 415 UNSUPPORTED_MEDIA_TYPE, 503 SERVICE_UNAVAILABLE (hoy `HTTP_ERROR`); el Sandbox no emite `retryable` ni mensaje fijo (usa el texto de la excepción, líneas 85-86, 100-115) y 400 sin código propio es `VALIDATION_ERROR` (Core: `INVALID_REQUEST`). §4.1 no impone esto al Sandbox, `code` es abierto, `retryable` opcional y los consumidores ignoran lo desconocido; Core no depende de estos códigos (reintenta por estado HTTP, §5). Sugerencia opcional de WI futuro, no requerida por INTEROP-2.18.
- MINOR-2: el mensaje de excepciones del framework se refleja en `message` (filter:100-115); §4 exige mensaje neutral sin texto crudo de terceros. Preexistente, sin relación con el delta.

## 3. Alcance del delta
Cambios relevantes al Sandbox: solo error-envelope.schema.json (descripciones de `code` abierto, `message`, `retryable`; sin cambio estructural) y su ejemplo `error-envelope.generic.json`. realtime-events.schema.json, los 5 ejemplos realtime y las entradas del manifest, y §6.6 (Socket.IO, AUTH_REQUIRED en handshake) son de Core↔Console; no aplican al Sandbox.

## 4. spec/features vs contrato
`git diff spec/features`: solo tasks.md (+ST-SANDBOX-015, T-READY, "sin cambio de comportamiento esperado"), coherente. `grep` de INTEROP/códigos en spec/features: sin contradicciones con INTEROP-2.18 detectadas.

## Bloqueos
Ninguno.
