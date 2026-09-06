# 008-reliability-lifecycle — Tareas

- [ ] Lifecycle state. — no implementado todavía como estado formal dedicado; hoy vive implícito en `ExecutionRecord.status`/`stage` (001-execution-api).
- [x] idempotent cleanup. — `WorkspaceManager.cleanup` (`fs.rm force:true`, 002-project-workspace) y `ContainerRunner` (`container.remove({force:true})` en `finally`, 004-container-execution) son idempotentes y se invocan en cada camino de fallo del pipeline.
- [x] TTL sweeper. — `WorkspaceManager.sweepExpired()` (002-project-workspace) existe y está probado; su programación automática (cron/interval) queda pendiente, ver nota abajo.
- [x] health/readiness. — `GET /health/live` y `GET /health/ready` implementados en esta entrega (ver evidencia).
- [ ] fault injection tests. — cubierto parcialmente por los tests de fallos mockeados de `execution-pipeline.service.spec.ts`; no hay una suite dedicada de inyección de fallos más allá de eso (p. ej. container crash simulado, disco lleno).

## Calidad

- [x] Agregar/actualizar pruebas. (para lo implementado en esta entrega: health/readiness)
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.

## Nota

La programación automática del sweeper (ejecutarlo periódicamente, no solo cuando se invoca manualmente/en tests) y una suite de fault injection más completa quedan fuera de esta entrega; no hay decisión `PENDING` que las bloquee, es trabajo restante identificado para una iteración futura de esta misma feature.
