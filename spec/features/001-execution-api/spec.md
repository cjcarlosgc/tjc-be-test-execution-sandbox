# 001-execution-api — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19

## Objetivo

Aceptar solicitudes internas neutrales de ejecución y devolver un identificador/resultado trazable conforme a `INTEROP-1.1`.

## Reglas y comportamiento

- `POST /executions` acepta `CreateSandboxExecutionRequest` y devuelve `202 SandboxExecutionAcceptedResponse`.
- `GET /executions/{executionId}` y `/result` exponen estado ligero y resultado terminal respectivamente.
- `Idempotency-Key` debe coincidir con `requestId`; misma key/body reutiliza la ejecución y misma key/body distinto devuelve `409 IDEMPOTENCY_CONFLICT`.
- Requiere autenticación Bearer servicio-a-servicio y propaga `x-correlation-id`.
- Debe recibir identificadores y `EphemeralDownloadRef` suficientes para descargar el snapshot exacto y los artefactos generados sin credenciales del proveedor.
- Rechazar paths/inputs inválidos antes de crear container.
- No aceptar ningún campo de estrategia (`RAG`, `GENERALIST_AGENT`, `BASELINE` u otro) porque no es responsabilidad del Sandbox.

`DEC-INT-001` está APROBADO y resuelto por `spec/contracts/interoperability-contract.md`.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
