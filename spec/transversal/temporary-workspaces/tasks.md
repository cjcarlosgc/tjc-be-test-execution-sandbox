# temporary-workspaces — Tareas

- [x] Raíz configurada, directorios aleatorios y permisos mínimos. — `WorkspaceManager` (`SANDBOX_WORKSPACE_ROOT`, directorio por `executionId` con `mode 0o700`); nunca acepta una raíz del request.
- [x] Helpers de rutas seguras, rechazo de enlaces/colisiones y defensas Zip Slip. — `WorkspaceManager.resolveWithin` (defensa en profundidad) + `SafeArchiveExtractor` (rechaza rutas absolutas, `..`, symlinks vía bit de modo Unix).
- [x] Límites de entradas, bytes y relación de expansión. — `SANDBOX_MAX_ZIP_ENTRIES`/`SANDBOX_MAX_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_COMPRESSION_RATIO`.
- [x] Montaje mínimo en container y cleanup idempotente. — un único bind mount del workspace; `WorkspaceManager.cleanup` idempotente en todo camino terminal.
- [x] Sweeper por TTL limitado a la raíz administrada. — `WorkspaceManager.sweepExpired()`, programado por `WorkspaceSweeperService`; solo actúa sobre subdirectorios cuyo nombre es un `executionId` válido bajo la raíz.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
