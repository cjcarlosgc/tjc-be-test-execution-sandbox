# Revisión de work item — 001-execution-api (scaffold + Execution API)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Work item:** `001-execution-api-scaffold` (`harness/state.json`)

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19 (`spec/features/001-execution-api/spec.md`).
- Decisión resuelta: `DEC-SBX-001` (package manager del servicio Sandbox = `pnpm`), aprobada por el usuario y consolidada en `spec/constitution/tech-stack.md` y `CHANGELOG.md`. No bloqueaba ninguna otra decisión el work item (`DEC-SBX-002` no alcanza a `001-execution-api`).
- Alcance implementado: scaffold NestJS (`app/`), módulo `executions` (`POST /executions`, `GET /executions/:id`, `GET /executions/:id/result`), DTOs de `INTEROP-1.1` §7.2–7.3, idempotencia `Idempotency-Key`↔`requestId`, guard Bearer service-to-service, middleware/propagación de `x-correlation-id`, `ErrorEnvelope` centralizado vía filtro global.
- Fuera de alcance (correctamente diferido a features posteriores): descarga real de `EphemeralDownloadRef` (002/003), ejecución en container (004), adapters de runner (005), avance de `status`/`stage` más allá de `PENDING` y población de `result` (006). Estos puntos quedan como contrato ya tipado (`dto/responses.ts`, `domain/execution-record.ts`) sin implementación de pipeline, consistente con `plan.md` de la feature.
- No se agregó ningún campo de estrategia (`RAG`/`GENERALIST_AGENT`/`BASELINE`); el `ValidationPipe` global (`whitelist`+`forbidNonWhitelisted`) rechaza campos desconocidos, verificado en e2e.
- No se tocó código de otras features ni se amplió alcance más allá de `001-execution-api`.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 28/28 verdes — `ExecutionsService`, `BearerAuthGuard`, `IsRelativePathConstraint`.
- `pnpm test:e2e` (vitest + supertest, app completa): 6/6 verdes — 401 sin token, 400 sin `Idempotency-Key`, 400 por campo desconocido, 400 por traversal en `relativePath`, 202 con propagación de `x-correlation-id` + polling PENDING/409, 404 por `executionId` inexistente.
- Arranque manual (`node dist/main.js` con `SANDBOX_SERVICE_TOKEN` configurado) y `curl` contra `POST /executions`: `202` con `SandboxExecutionAcceptedResponse` válido.

## Manejo de errores y seguridad

- `ErrorEnvelope` (`statusCode, code, message, details, correlationId, timestamp, path`) centralizado en `HttpExceptionFilter`; controllers no formatean errores manualmente.
- Comparación del token Bearer con `timingSafeEqual`; ausencia de `SANDBOX_SERVICE_TOKEN` provoca fallo de arranque (fail-fast) y niega cualquier token en tiempo de request.
- `relativePath` validado contra traversal/absolutos/rutas Windows mediante validador propio; `sha256`, UUIDs y URLs (`https` únicamente) validados a nivel de DTO.
- Idempotencia: `Idempotency-Key` debe igualar `requestId`; reintento con mismo cuerpo reutiliza `executionId` (ignorando `url`/`expiresAt` reemitidos, conforme a `INTEROP-1.1` §7.2); cuerpo distinto con mismo `requestId` → `409 IDEMPOTENCY_CONFLICT`.

## Observabilidad mínima

- `x-correlation-id` se toma del request entrante o se genera, y siempre se devuelve en la respuesta (incluida en `ErrorEnvelope`).
- `ExecutionsService` registra `executionId, requestId, testRunId, projectVersionId, correlationId` al aceptar o reproducir una ejecución, sin registrar URLs firmadas ni contenido de `download`.

## Nota sobre el árbol de trabajo

Coexisten en el árbol de trabajo cambios previos no commiteados de la homologación **SDD 1.9** (`harness/state-schema.md`, `spec/constitution/architecture.md`, `spec/contracts/interoperability-contract.md`, `spec/contracts/system-contract.md`, `spec/features/004-container-execution/spec.md`), ya reflejados en el bloque `SDD 1.9` de `CHANGELOG.md`. Son una unidad de cambio independiente de este work item (no tocan `app/` ni `001-execution-api`) y no se mezclan en este veredicto; deben commitearse por separado bajo su propia trazabilidad `Refs`.

## Hallazgos

Ninguno abierto. No hay ampliación silenciosa de alcance ni decisiones `PENDING` convertidas en definitivas fuera de `DEC-SBX-001`.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita (`spec/constitution/delivery-workflow.md`); este reporte no autoriza por sí mismo ninguna de las dos acciones.
