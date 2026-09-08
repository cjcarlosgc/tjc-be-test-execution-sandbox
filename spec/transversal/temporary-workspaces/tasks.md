# temporary-workspaces — Tareas

- [x] Raíz configurada, directorios aleatorios y permisos mínimos. — `WorkspaceManager` (`SANDBOX_WORKSPACE_ROOT`, directorio por `executionId` con `mode 0o700`); nunca acepta una raíz del request.
- [x] Helpers de rutas seguras, rechazo de enlaces/colisiones y defensas Zip Slip. — `WorkspaceManager.resolveWithin` (defensa en profundidad) + `SafeArchiveExtractor` (rechaza rutas absolutas, `..`, symlinks vía bit de modo Unix). **Nota — carpeta contenedora única:** muchos snapshots reales (exports de GitHub, `zip -r carpeta/`) envuelven el proyecto entero en una única carpeta de nivel superior. `SafeArchiveExtractor.flattenSingleTopLevelDirectory` detecta ese caso al terminar la extracción y aplana esa carpeta contra la raíz del workspace, para que todo consumidor downstream (`readPackageJson`, `hasAnyConfigFile`, `hasPnpmLockfile`, y la resolución de `relativePath` de artefactos en `ArtifactMaterializer`) siga pudiendo asumir una estructura plana sin reimplementar la detección cada uno. Para que la detección funcione, el ZIP de staging se descarga en `os.tmpdir()` (nombrado por `executionId`), nunca dentro de `workspacePath`: si conviviera con el contenido ya extraído contaría como una segunda entrada de nivel superior y el aplanado nunca se dispararía.
- [x] Límites de entradas, bytes y relación de expansión. — `SANDBOX_MAX_ZIP_ENTRIES`/`SANDBOX_MAX_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_COMPRESSION_RATIO`.
- [x] Montaje mínimo en container y cleanup idempotente. — un único bind mount del workspace; `WorkspaceManager.cleanup` idempotente en todo camino terminal.
- [x] Sweeper por TTL limitado a la raíz administrada. — `WorkspaceManager.sweepExpired()`, programado por `WorkspaceSweeperService`; solo actúa sobre subdirectorios cuyo nombre es un `executionId` válido bajo la raíz.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
