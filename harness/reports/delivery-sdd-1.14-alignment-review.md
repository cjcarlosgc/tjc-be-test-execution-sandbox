# Revisión de work item — alineación con SDD 1.14 (Idempotency-Key)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19 (`spec/features/001-execution-api/spec.md`).
- Contexto: el usuario actualizó la SDD a `SDD 1.14 / SYSTEM-1.4 / INTEROP-1.5` sin tocar `app/` (confirmado explícitamente en `CHANGELOG.md`), formalizando `DEC-AUTH-001` y `DEC-IDEMP-001` (ambos `APROBADO`, sin bloqueo) y documentando el estado de implementación esperado del Sandbox.
- Revisión sistemática de todo lo que cambió en `spec/` (contratos, `001-execution-api`, `004`, `006`, `008`, transversales `errors`/`object-storage-access`, `architecture.md`, `system-contract.md`, `roadmap.md`, `backlog.md`) contra el código real. Único hallazgo: `Idempotency-Key` debe validarse como UUID con tres códigos distintos (`INTEROP-1.5` §3/§7.4, `errors` transversal): `IDEMPOTENCY_KEY_REQUIRED` (ausente), `INVALID_IDEMPOTENCY_KEY` (presente pero no-UUID), `IDEMPOTENCY_KEY_MISMATCH` (UUID válido pero distinto de `requestId`). El código usaba un `VALIDATION_ERROR` genérico para el caso ausente y no validaba el formato UUID en absoluto.
- Todo lo demás ya coincidía con lo documentado como "implementación Sandbox vigente": Bearer opaco vía `SANDBOX_SERVICE_TOKEN` validado al arranque y comparado con `timingSafeEqual`, protección de todo `/executions` con `/health/*` público, deduplicación por huella lógica ignorando `url`/`expiresAt`, `pnpm` + `pnpm-lock.yaml` como única combinación V1, replay que nunca crea un segundo workspace/container (el pipeline solo se dispara para registros nuevos, no en el camino de replay).

## Cambios

- `src/common/validation/uuid.ts` (nuevo): `isUuid()`, formato genérico de UUID (acepta v4 y v5, ya que Core deriva `Idempotency-Key`/`requestId` como v5 mientras el Sandbox genera `executionId` como v4 con `randomUUID()`).
- `executions.controller.ts`: `Idempotency-Key` ausente → `400 IDEMPOTENCY_KEY_REQUIRED`; presente pero no-UUID → `400 INVALID_IDEMPOTENCY_KEY` (antes: `400 VALIDATION_ERROR` genérico y sin chequeo de formato). El mismatch contra `requestId` (`IDEMPOTENCY_KEY_MISMATCH`) y el conflicto de huella (`IDEMPOTENCY_CONFLICT`) ya eran correctos en `executions.service.ts` y no cambiaron.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 109/109 verdes — agrega `uuid.spec.ts` (acepta v4/v5, rechaza formatos inválidos).
- `pnpm test:e2e`: 15/15 verdes — agrega dos casos en `executions.e2e-spec.ts`: `Idempotency-Key` no-UUID → `INVALID_IDEMPOTENCY_KEY`; `Idempotency-Key` UUID válido pero distinto de `requestId` → `IDEMPOTENCY_KEY_MISMATCH`; el caso de header ausente ahora verifica también el código exacto.

## Manejo de errores y seguridad

- Ningún cambio de superficie de ataque: la validación de formato ocurre antes de cualquier acceso a repositorio o disparo del pipeline, evitando trabajo innecesario ante un header claramente inválido.

## Observabilidad mínima

- Sin cambios; los logs existentes ya no mencionan el valor del header, solo el resultado de la validación vía el código de error devuelto al cliente.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. La prueba de integración real Core↔Sandbox (identidad UUID v5 derivada, Bearer real) sigue pendiente de que `tjc-be-rag-core-api` implemente su lado — trabajo de otro repositorio, no una decisión abierta aquí.
