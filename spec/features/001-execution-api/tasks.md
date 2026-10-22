# 001-execution-api — Tareas

- [x] DTOs validados de `INTEROP-2.1` y rechazo de campos desconocidos.
- [x] `POST /executions`, status y result con persistencia de `executionId`.
- [x] Idempotency-Key/requestId y detección de conflicto.
- [x] Auth Bearer interna con `SANDBOX_SERVICE_TOKEN`, protección de todo `/executions`, health público y propagación de correlationId.
- [x] **ST-SANDBOX-009 · T-DONE · WI-SANDBOX-009 · HU11:** test que ejecuta el cliente HTTP real de RAG Core (`SandboxExecutionService`, solo lectura) contra el Sandbox real servido por HTTP: un caso feliz (`COMPLETED` con facts) y un caso de fallo (`INFRASTRUCTURE`/`SANDBOX_RESTARTED` o timeout); omitido con aviso si el repositorio de Core no está disponible; evidencia CT-06/CT-07. Cubre el desajuste entre lo que Core espera y lo que el Sandbox emite; no duplica `executions.contract-real.spec.ts`.
- [x] **ST-SANDBOX-011 · T-DONE · WI-SANDBOX-011 · HU11:** regularizar de forma retroactiva la migración a SDD 3.1 / Harness V3 y la redacción de host/IP de la propuesta TLS que ejecutó cross sin WI (commits 9198d55 y c110f84).
- [x] **ST-SANDBOX-012 · T-DONE · WI-SANDBOX-012 · HU11:** regularizar de forma retroactiva los tipos de `/executions` generados desde `spec/contracts/schemas` y el test HTTP de contrato que ejecutó cross sin WI (commit 9121d58).
- [x] **ST-SANDBOX-013 · T-DONE · WI-SANDBOX-013 · HU11:** homologar el espejo con SYSTEM-2.13 / INTEROP-2.17 y los esquemas (CS-CORE-20261018-003), acusar CS-CORE-20261009-016, contract tests C-06/C-07 y revisar el mapa de HU contra el catálogo compartido y las 18 HU de la tesis.
- [ ] **ST-SANDBOX-015 · T-IN_PROGRESS · WI-SANDBOX-015 · HU11:** homologar el espejo con INTEROP-2.18 y los esquemas (CS-CORE-20261021-003): re-espejar byte a byte, regenerar tipos, reejecutar los contract tests C-06/C-07 y el del cliente real de Core; sin cambio de comportamiento esperado.
- [x] Response DTOs y `ErrorEnvelope` centralizado.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
