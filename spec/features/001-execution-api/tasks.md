# 001-execution-api — Tareas

- [x] DTOs validados de `INTEROP-1.6` y rechazo de campos desconocidos.
- [x] `POST /executions`, status y result con persistencia de `executionId`.
- [x] Idempotency-Key/requestId y detección de conflicto.
- [x] Auth Bearer interna con `SANDBOX_SERVICE_TOKEN`, protección de todo `/executions`, health público y propagación de correlationId.
- [ ] Contract/e2e test contra el cliente real de RAG Core cuando ese repositorio implemente Bearer e identidad UUID v5 estable.
- [x] Response DTOs y `ErrorEnvelope` centralizado.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
