Modelo: contract-reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# Revision de contrato WI-SANDBOX-013

Veredicto: APPROVED

## Verificaciones
1. Espejo: shasum system-contract.md = b70f9358...a0444 (OK); interoperability-contract.md = b9ed40dc...dea05 (OK); arbol schemas = c45e4513...a1b31 (OK). `cmp` de ambos .md contra ../tjc-be-rag-core-api/spec/contracts: identicos; `diff -rq` schemas: identico. github-integration-contract.md existe en Core, NO aqui (`ls spec/contracts` = interoperability-contract.md, schemas, system-contract.md): correcto.
2. Consistencia HTTP codigo vs INTEROP-2.17: rutas POST /executions (202, executions.controller.ts:26-47), GET /:id y /:id/result (:49-61); Idempotency-Key requerido/UUID/igual a requestId (controller:36-49, service:42-48); IDEMPOTENCY_CONFLICT 409 (service:60-64); EXECUTION_NOT_FOUND 404 (service:161) y EXECUTION_NOT_FINISHED 409 (service:127-140); 202 con status PENDING + pollAfterMs (service:233); estado sin pollAfterMs (service:107-120), permitido por §5 (opcional); ValidationPipe whitelist+forbidNonWhitelisted (main.ts:24-28); envelope completo sin retryable (error-envelope.ts, filter), correcto porque retryable es opcional y el Sandbox no lo declara; x-correlation-id devuelto (correlation-id.middleware.ts:18); phase=BASELINE con artefactos -> 400 VALIDATION_ERROR (service:192-197); projectRoot != '.' en NODE -> 400 (service:206-224); token de servicio exigido en /executions y arranque falla sin SANDBOX_SERVICE_TOKEN (main.ts:8-10, bearer-auth.guard.ts).
3. `git diff 2abbaaa -- spec/contracts`: solo interoperability-contract.md, 2 lineas: §5 (pollAfterMs opcional en GET de estado, reintentos Core) y §10 (validacion en frontera transitoria de Core). Coinciden con las dos diferencias editoriales conocidas. system-contract.md y schemas sin cambios.
4. spec/features/**: diff vs 2abbaaa son 12 ficheros, 24 lineas, solo remapeo de HU antiguas (HU43/HU08.. -> HU11/HU12/HU17); sin contradiccion con el contrato.

## Hallazgos
- MINOR-1: 401 de servicio usa code `UNAUTHORIZED` (bearer-auth.guard.ts:22-25,35-38) mientras INTEROP §3 define AUTH_REQUIRED/INVALID_ACCESS_TOKEN solo para token de usuario en Core; para el token de servicio el contrato no fija codigo. No es incumplimiento; sugerencia: aclarar en un corte futuro.
- MINOR-2: UNSUPPORTED_PROJECT/RUNNER/PACKAGE_MANAGER no se devuelven como 422 previo al 202 (service.create no los detecta); el contrato (§7.4) lo exige solo "cuando puedan detectarse" y permite persistirlos como FAILED/CONFIGURATION. Conforme.
- MINOR-3: `ErrorEnvelope` local (app/src/common/http/error-envelope.ts) es manual en vez de generado desde error-envelope.schema.json (§10 pide tipos generados); app/src/contracts/generated existe para el resto. Menor, fuera del alcance de este WI.

Blockers: ninguno.

## Comandos
shasum -a 256 spec/contracts/*.md; cd spec/contracts/schemas && find . -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256; cmp contra ../tjc-be-rag-core-api/spec/contracts; diff -rq schemas; ls spec/contracts; git diff 2abbaaa -- spec/contracts; git diff 2abbaaa -U0 -- spec/features; lectura de executions.controller.ts, executions.service.ts, http-exception.filter.ts, error-envelope.ts, bearer-auth.guard.ts, main.ts.
