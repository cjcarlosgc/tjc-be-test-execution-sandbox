# errors — Tareas

- [x] Error model. — `SandboxFactError` (y subclases: `InputUrlExpiredError`, `InputDownloadFailedError`, `IntegrityCheckFailedError`, `InvalidArchiveError`, `InvalidArtifactPathError`, `UnsupportedRunnerError`, `UnsupportedPackageManagerError`, `DependencyInstallFailedError`, `TestExecutionFailedError`, `OomKilledError`, `SandboxTimeoutError`) para fallos post-`202` con `code`/`category`; `AppHttpException` para errores HTTP pre-`202` con `code`.
- [x] HTTP mapping. — `HttpExceptionFilter` centraliza `ErrorEnvelope` para todo error HTTP; ningún controller formatea manualmente.
- [x] result-vs-platform tests. — cubierto en `execution-pipeline.service.spec.ts`/`full-pipeline.e2e-spec.ts`: un test que ejecuta pero falla es `200`/`COMPLETED` con `facts.passed=false` (nunca un error HTTP ni `FAILED`); solo problemas de plataforma (descarga, instalación, timeout, OOM, runner sin reporte) producen `FAILED`/`TIMED_OUT`.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
