# 001-execution-api — Tareas

- [x] DTOs validados de `INTEROP-2.1` y rechazo de campos desconocidos.
- [x] `POST /executions`, status y result con persistencia de `executionId`.
- [x] Idempotency-Key/requestId y detección de conflicto.
- [x] Auth Bearer interna con `SANDBOX_SERVICE_TOKEN`, protección de todo `/executions`, health público y propagación de correlationId.
- [ ] **ST-SANDBOX-009 · T-BACKLOGGED · WI-SANDBOX-009 · HU11:** contract/e2e test contra el cliente real de RAG Core (Bearer e identidad UUID v5 estable); verificar primero si Core ya los implementa y, si es así, ejecutar la prueba; si no, registrar el bloqueo.
- [ ] **ST-SANDBOX-011 · T-IN_PROGRESS · WI-SANDBOX-011 · HU11:** regularizar de forma retroactiva la migración a SDD 3.1 / Harness V3 y la redacción de host/IP de la propuesta TLS que ejecutó cross sin WI (commits 9198d55 y c110f84).
- [ ] **ST-SANDBOX-012 · T-BACKLOGGED · WI-SANDBOX-012 · HU11:** regularizar de forma retroactiva los tipos de `/executions` generados desde `spec/contracts/schemas` y el test HTTP de contrato que ejecutó cross sin WI (commit 9121d58).
- [ ] **ST-SANDBOX-013 · T-BACKLOGGED · WI-SANDBOX-013 · HU11:** homologar el espejo con SYSTEM-2.13 / INTEROP-2.17 y los esquemas (CS-CORE-20261018-003), acusar CS-CORE-20261009-016, contract tests C-06/C-07 y revisar el mapa de HU contra el catálogo compartido y las 18 HU de la tesis.
- [x] Response DTOs y `ErrorEnvelope` centralizado.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
