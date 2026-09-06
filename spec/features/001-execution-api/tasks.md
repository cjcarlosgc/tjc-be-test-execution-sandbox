# 001-execution-api — Tareas

- [x] DTOs validados de `INTEROP-1.1` y rechazo de campos desconocidos.
- [x] `POST /executions`, status y result con persistencia de `executionId`.
- [x] Idempotency-Key/requestId y detección de conflicto.
- [x] Auth Bearer interna y propagación de correlationId.
- [x] Response DTOs y `ErrorEnvelope` centralizado.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
