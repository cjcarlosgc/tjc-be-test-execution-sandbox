# resource-limits — Tareas

- [x] Esquema de configuración para tiempo, CPU, RAM, disco temporal, PIDs, output y ZIP. — tiempo (`SANDBOX_CONTAINER_TIMEOUT_MS`/`SANDBOX_INSTALL_TIMEOUT_MS`/`SANDBOX_TEST_TIMEOUT_MS`/`SANDBOX_EXECUTION_DEADLINE_MS`), CPU (`SANDBOX_CONTAINER_NANO_CPUS`), RAM (`SANDBOX_CONTAINER_MEMORY_BYTES`), disco (`SANDBOX_MAX_WORKSPACE_BYTES`, ver nota abajo), PIDs (`SANDBOX_CONTAINER_PIDS_LIMIT`), output (`SANDBOX_CONTAINER_MAX_OUTPUT_BYTES`, `SANDBOX_MAX_DOWNLOAD_BYTES`), ZIP (`SANDBOX_MAX_ZIP_ENTRIES`/`SANDBOX_MAX_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_COMPRESSION_RATIO`).
- [x] Límites Docker y workspace/download. — aplicados en `ContainerRunner.run()` (`HostConfig`) y en `HttpExecutionInputDownloadService`/`streamToFileWithLimit` (bytes, timeout). **Nota — disco temporal del container:** `HostConfig.DiskQuota` de Docker solo funciona con el storage driver `devicemapper`, no con `overlay2` (el default de Docker Desktop, el entorno aprobado) — no hay forma de aplicar una cuota real a nivel del motor ahí. Sustituto a nivel de aplicación: `WorkspaceManager.calculateDirectorySize` mide el tamaño real en disco del workspace (recursivo, sin seguir symlinks) justo después de `pnpm install` — el momento de mayor riesgo (`node_modules`) — y `ExecutionPipelineService` falla la ejecución (`WORKSPACE_DISK_LIMIT_EXCEEDED`/`INFRASTRUCTURE`) si excede `SANDBOX_MAX_WORKSPACE_BYTES` antes de correr ningún test.
- [x] Normalización de OOM, timeout, disco/PIDs/output y cleanup. — `OomKilledError` (`OOM_KILLED`/`INFRASTRUCTURE`, vía `State.OOMKilled` del container) distingue un límite de memoria excedido de un fallo lógico de instalación/test; timeout produce `TIMED_OUT` (no `FAILED`); disco cubierto por el guard descrito arriba; `PidsLimit`/output ya acotados; cleanup siempre corre.
- [x] Pruebas que demuestren que el request no puede elevar límites. — `ValidationPipe` (`whitelist`+`forbidNonWhitelisted`) rechaza cualquier campo no declarado; test e2e dedicado envía `timeoutMs`/`memoryBytes`/`cpuLimit` y confirma `400 VALIDATION_ERROR`. Los límites mismos solo se leen de `ConfigService`, nunca del DTO del request.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
