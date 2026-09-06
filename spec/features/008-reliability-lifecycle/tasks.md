# 008-reliability-lifecycle — Tareas

- [ ] Lifecycle state. — no implementado como estado formal dedicado; hoy vive implícito en `ExecutionRecord.status`/`stage` (001-execution-api). Sin bloqueo; identificado para una iteración futura si se necesita más granularidad que `SandboxStage`.
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
