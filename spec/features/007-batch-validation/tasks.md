# 007-batch-validation — Tareas

- [x] Batch manifest. — el Sandbox no distingue estructura adicional: `record.artifacts` ya es el conjunto final del run actual (`CreateSandboxExecutionRequest.artifacts`), aplicado tal cual llega.
- [x] apply final artifacts. — `ArtifactMaterializer.applyArtifacts` (002/003) escribe el conjunto completo antes de instalar/ejecutar, verificado con un artefacto `MODIFIED` real en `full-pipeline.e2e-spec.ts`.
- [x] execute runner. — `ContainerRunner.runTestCommand` + `TestRunnerAdapter.buildCommand` (005), verificado con Vitest real.
- [x] map per-file/overall result. — `RunnerFacts.testCases[].suitePath` identifica el archivo; los conteos agregados (`totalTests`/`passedTests`/`failedTests`) son el resultado global del batch. El Sandbox no calcula `valid` por archivo: eso es responsabilidad de Core (interoperability-contract §7.3).

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
