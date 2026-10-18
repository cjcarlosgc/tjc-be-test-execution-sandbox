# 008-reliability-lifecycle — Tareas

- [ ] **ST-SANDBOX-010 · T-IN_PROGRESS · WI-SANDBOX-010 · HU11:** estabilizar el ciclo de vida del Sandbox: estado formal de lifecycle, persistencia en disco del repositorio de ejecuciones (`SANDBOX_EXECUTION_STATE_DIR`; recarga al arrancar, sin URLs ni rutas, retención también en disco, ejecuciones en curso → `FAILED`/`SANDBOX_RESTARTED`), límite de concurrencia, reconciliación de containers huérfanos, `enableShutdownHooks()` y validación de variables de entorno. Diagnóstico base: `harness/reports/phase2-stabilization-diagnostic-2026-10-13.md`. **Nota (2026-10-18):** la retención acotada, el tope de concurrencia, la reconciliación de contenedores huérfanos, `enableShutdownHooks()` y la validación de entorno se implementaron desde la sesión cross en la Fase 3 (commit 3a8f8d6), fuera del flujo del WI; este WI los regulariza con revisión independiente e incorpora la persistencia en disco aprobada por el usuario (relayada por cross). Alcance sin cambio del contrato HTTP.
- [x] idempotent cleanup. — `WorkspaceManager.cleanup` (`fs.rm force:true`, 002-project-workspace) y `ContainerRunner` (`container.remove({force:true})` en `finally`, 004-container-execution) son idempotentes; probado además que un fallo de `cleanup()` nunca oculta un resultado `FAILED` ya persistido (`execution-pipeline.service.spec.ts`).
- [x] TTL sweeper. — `WorkspaceManager.sweepExpired()` (002-project-workspace) existe, probado, y ahora se programa automáticamente cada `SANDBOX_SWEEPER_INTERVAL_MS` (`WorkspaceSweeperService`, `OnModuleInit`/`OnModuleDestroy`).
- [x] health/readiness. — `GET /health/live` y `GET /health/ready`.
- [x] fault injection tests. — `execution-pipeline.service.spec.ts` cubre fallo de descarga, error inesperado, incompatibilidad de runner y fallo de `cleanup()` en sí mismo, todos preservando el resultado `FAILED` correcto; `workspace-sweeper.service.spec.ts` cubre que `sweepExpired()` rechazando nunca detiene el temporizador ni propaga.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
