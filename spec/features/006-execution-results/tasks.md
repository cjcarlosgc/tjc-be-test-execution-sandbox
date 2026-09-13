# 006-execution-results — Tareas

- [x] Result models. — `RunnerFacts`/`TestCaseFact`/`StageDuration`/`ExecutionEvidenceFact` (`INTEROP-2.0` §7.3) poblados por `ExecutionPipelineService` al completar `RUNNING_TESTS`.
- [x] demux stdout/stderr. — `ContainerRunner.collectLogs` desmultiplexa vía `docker.modem.demuxStream`.
- [x] truncation/evidence policy. — límite configurable (`SANDBOX_CONTAINER_MAX_OUTPUT_BYTES`) con `truncated`/`originalBytes` reales por stream y por el reporte JSON crudo (`RUNNER_REPORT`, acotado a `MAX_EVIDENCE_BYTES`).
- [x] stage durations. — `stageDurations` acumula `PREPARING`, `INSTALLING_DEPENDENCIES`, `RUNNING_TESTS` con duración real medida.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
