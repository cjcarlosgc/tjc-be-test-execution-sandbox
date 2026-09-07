# resource-limits — Tareas

- [x] Esquema de configuración para tiempo, CPU, RAM, disco temporal, PIDs, output y ZIP. — tiempo (`SANDBOX_CONTAINER_TIMEOUT_MS`/`SANDBOX_INSTALL_TIMEOUT_MS`/`SANDBOX_TEST_TIMEOUT_MS`/`SANDBOX_EXECUTION_DEADLINE_MS`), CPU (`SANDBOX_CONTAINER_NANO_CPUS`), RAM (`SANDBOX_CONTAINER_MEMORY_BYTES`), PIDs (`SANDBOX_CONTAINER_PIDS_LIMIT`), output (`SANDBOX_CONTAINER_MAX_OUTPUT_BYTES`, `SANDBOX_MAX_DOWNLOAD_BYTES`), ZIP (`SANDBOX_MAX_ZIP_ENTRIES`/`SANDBOX_MAX_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_COMPRESSION_RATIO`). Disco temporal del **container** (más allá del ZIP ya acotado) queda como limitación conocida: `HostConfig.DiskQuota` de Docker solo funciona con el storage driver `devicemapper`, no con `overlay2` (el default de Docker Desktop) — no hay forma de aplicarlo de verdad en el entorno aprobado (`architecture.md`); el límite real de disco del workspace lo da el tamaño del ZIP ya acotado.
- [x] Límites Docker y workspace/download. — aplicados en `ContainerRunner.run()` (`HostConfig`) y en `HttpExecutionInputDownloadService`/`streamToFileWithLimit` (bytes, timeout).
- [x] Normalización de OOM, timeout, disco/PIDs/output y cleanup. — `OomKilledError` (`OOM_KILLED`/`INFRASTRUCTURE`, vía `State.OOMKilled` del container) distingue un límite de memoria excedido de un fallo lógico de instalación/test; timeout produce `TIMED_OUT` (no `FAILED`); `PidsLimit`/output ya acotados; cleanup siempre corre.
- [x] Pruebas que demuestren que el request no puede elevar límites. — `ValidationPipe` (`whitelist`+`forbidNonWhitelisted`) rechaza cualquier campo no declarado; test e2e dedicado envía `timeoutMs`/`memoryBytes`/`cpuLimit` y confirma `400 VALIDATION_ERROR`. Los límites mismos solo se leen de `ConfigService`, nunca del DTO del request.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
