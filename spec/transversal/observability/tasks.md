# observability — Tareas

- [x] structured logs. — cada log de transición/fallo del pipeline incluye `executionId`/`requestId`/`testRunId`/`projectVersionId`/`stage`/`code` en formato `key=value` consistente (no JSON; la spec pide registrar esos identificadores, no un formato de log específico). `ContainerRunner` registra `exitCode`/`oomKilled`/`timedOut`/`durationMs` por invocación, nunca stdout/stderr.
- [ ] metrics. — fuera de alcance de esta entrega: ninguna spec de comportamiento pide un endpoint `/metrics` o serie temporal; las "métricas" que el sistema realmente expone (duración por etapa, resultado, tokens/costo en el caso de experimentos) ya viajan en `SandboxExecutionResultResponse.stageDurations`/`facts` vía la API, que es donde `system-contract.md` las sitúa. Construir un endpoint de métricas de operación sin un consumidor definido sería alcance no solicitado.
- [x] redaction/truncation. — la URL firmada nunca se registra completa (solo se usa para el propio `fetch`); stdout/stderr/reporte del runner se truncan con `truncated`/`originalBytes` reales; ningún log incluye `SANDBOX_SERVICE_TOKEN` ni contenido de `Authorization`.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
