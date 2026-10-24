Modelo: implementer · configurado claude-haiku-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-015 — Implementación (INTEROP-2.18, CS-CORE-20261021-003)

Alcance: regenerar tipos del contrato y añadir pruebas de errores genéricos del Sandbox. Sin cambios de producción, sin cambios en spec/, harness/ (salvo este reporte), ni en ../tjc-be-rag-core-api. Sin commit ni push.

## 1. Regeneración de tipos (`pnpm contracts:generate`)

Archivos cambiados: `app/src/contracts/generated/contract-types.ts` (+177/-6) y `app/src/contracts/generated/contract-schemas.ts` (+518/-6 aprox.; 689 inserciones, 6 eliminaciones en total).

Diff revisado con `git diff -U0`. Las únicas líneas eliminadas son descripciones de la versión anterior:
- `ErrorEnvelope.code`: descripción ahora dice que el código es abierto y que los genéricos de §4 se emiten solo cuando el error no trae código propio.
- `ErrorEnvelope.message`: descripción ahora menciona mensaje fijo en español en los genéricos.
- `ErrorEnvelope.retryable`: descripción ahora dice que Core lo declara solo en genéricos (true en TOO_MANY_REQUESTS y SERVICE_UNAVAILABLE).

Las demás adiciones son los tipos y el bundle de `realtime-events.schema.json` (generador lee todos los `*.schema.json`): `SubscribeAck`, `SubscribeAck1`, `AnalysisRunStatus`, `SubscribeProjectVersionPayload`, `SubscribeAnalysisRunPayload`, `SubscribeExperimentPayload`, `PullRequestRefResponse`, `AnalysisSymbolResponse`, `AnalysisRunDetailResponse`, `ExperimentModelConfigResponse`, `ExperimentBudgetResponse`, `ExperimentStatusResponse`. No se importan en el Sandbox.

Sin cambios en los tipos de sandbox-execution. `pnpm contracts:check` pasa (rc=0) tras la regeneración.

## 2. Pruebas nuevas

Archivo nuevo: `app/src/common/http/http-exception.filter.generic.spec.ts`. Monta Nest real con `HttpExceptionFilter`, `ValidationPipe`, `CorrelationIdMiddleware` y `BearerAuthGuard` reales, más un controlador de sonda. Cada envelope se valida con `validateContract('error-envelope.schema.json', null, body)`, se comprueba que no tenga `retryable` y que `code` esté en los 13 nombres de INTEROP-2.18 §4.1 o sea `HTTP_ERROR`.

| Caso | Resultado |
|---|---|
| 404 ruta inexistente → NOT_FOUND | pasa |
| Método no soportado en ruta existente → 404 NOT_FOUND | pasa (Express/Nest no emiten 405; ver hallazgos) |
| 405 con HttpException(405) → HTTP_ERROR (unitario del filtro) | pasa |
| 413 con HttpException(413) en ruta real → PAYLOAD_TOO_LARGE | pasa |
| 401 sin Authorization → UNAUTHORIZED | pasa |
| 401 token inválido → UNAUTHORIZED | pasa |
| 413 por cuerpo JSON de 200 KB (parser de Express) → PAYLOAD_TOO_LARGE | pasa (tras el fix, ver §4) |
| 413 unitario: error body-parser (type entity.too.large) → PAYLOAD_TOO_LARGE, sin texto crudo | pasa (tras el fix) |

## 3. Resultados de verificación

- `pnpm lint` (oxlint src/ test/): rc=0.
- `pnpm build` (nest build): rc=0.
- `pnpm contracts:check`: rc=0.
- `pnpm test` (vitest run) tras el fix: rc=0. Test Files 36 passed, 1 skipped (37). Tests 319 passed, 5 skipped (324). Sin expected fails.
- `pnpm test:e2e` en la copia sin `app/.env` local del usuario (copia en scratchpad, sin tocar el `.env` real): rc=0. Tests 15 passed, 6 skipped (21). Test Files 2 passed, 1 skipped (3). Es la cifra válida de e2e.
- `pnpm test:e2e` en el árbol de trabajo (con `app/.env` local, no leído ni tocado): fallos por la configuración local del usuario, causa aislada por el coordinador; no es un fallo de código.
- `pnpm test:e2e` en el árbol de trabajo antes de aislar el .env (histórico):
  - Sin variable de entorno de token: rc=1. Tests 12 failed, 3 passed, 6 skipped (21). Todos los fallos eran `401` en `test/executions.e2e-spec.ts`, por no tener `SANDBOX_SERVICE_TOKEN` en el entorno del proceso.
  - Con `SANDBOX_SERVICE_TOKEN=e2e-service-token pnpm test:e2e`: rc=1. Tests 2 failed, 13 passed, 6 skipped (21). Fallos restantes: `downloads a real snapshot over HTTPS...` y `fails with UNSUPPORTED_RUNNER when runnerHint does not match the project`, ambos con `INPUT_DOWNLOAD_FAILED` en lugar del código esperado. Causa raíz de la descarga no aislada en esta sesión; no toca código modificado (el cambio de tipos solo afecta descripciones y validadores; las pruebas de descarga no usan esos tipos).
  - Docker no está disponible (`docker info` rc=127), así que `full-pipeline.e2e-spec.ts` se omitió (`describe.skipIf`).
- Pruebas explícitas (vitest run sobre los 4 archivos) tras el fix: rc=0. Test Files 4 passed (4). Tests 35 passed, 1 skipped (36).
  - `executions.contract-real.spec.ts`: C-06 (T4, T5, T6, T9, T10) y C-07 (T1, T1b, T2, T3, T7 x3, T8 x3, T10): todos pasan.
  - `core-client.contract.spec.ts`: CT-06 caso feliz y CT-07 fallo terminal pasan. El "skipped" que aparece es un aviso del propio archivo, no una prueba.
  - `executions.contract.spec.ts`: 8 pasan.
  - `http-exception.filter.generic.spec.ts`: 8 pasan.

## 4. Hallazgos

1. **Incumplimiento real corregido (413 por cuerpo grande).** body-parser lanza `PayloadTooLargeError`, que no es `HttpException`. `HttpExceptionFilter` lo trata como error no HTTP y responde `500 INTERNAL_ERROR` con log de error. §4.1 exige `413 PAYLOAD_TOO_LARGE`. Caso mínimo: `POST /probe/echo` con JSON de ~200 KB (límite por defecto de Express de 100 KB). Corregido en `app/src/common/http/http-exception.filter.ts` (`isBodyTooLarge` + rama en `resolve()`): `type === 'entity.too.large'` o `status`/`statusCode` 413 → 413 PAYLOAD_TOO_LARGE, mensaje fijo de §4.1, `details` null, sin `retryable` y sin reflejar el texto crudo. No se cambió ningún otro código del filtro. Prueba `it.fails` pasa a `it`; añadida prueba unitaria con error `type: 'entity.too.large'`.
2. **Sin 405 en el Sandbox.** Express/Nest responden 404 para método no soportado en una ruta existente, así que el envelope es `NOT_FOUND`. El filtro sí mapea `HttpException(405)` a `HTTP_ERROR` (no a `METHOD_NOT_ALLOWED`), comportamiento ya conocido y permitido por `code` abierto. Ver también el análisis SDD §3.
3. `retryable` ausente en todos los envelopes probados, conforme al análisis SDD.

## 5. Archivos afectados

- `app/src/contracts/generated/contract-types.ts` (regenerado)
- `app/src/contracts/generated/contract-schemas.ts` (regenerado)
- `app/src/common/http/http-exception.filter.ts` (fix 413 body-parser)
- `app/src/common/http/http-exception.filter.generic.spec.ts` (nuevo)
- `harness/reports/wi-sandbox-015-implementation.md` (este reporte)

Sin commit ni push.
