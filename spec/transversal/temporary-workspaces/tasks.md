# temporary-workspaces — Tareas

- [x] Raíz configurada, directorios aleatorios y permisos mínimos. — `WorkspaceManager` (`SANDBOX_WORKSPACE_ROOT`, directorio por `executionId` con `mode 0o700`); nunca acepta una raíz del request.
- [x] Helpers de rutas seguras, rechazo de enlaces/colisiones y defensas Zip Slip. — `WorkspaceManager.resolveWithin` (defensa en profundidad) + `SafeArchiveExtractor` (rechaza rutas absolutas, `..`, symlinks vía bit de modo Unix). **Nota — carpeta contenedora única:** muchos snapshots reales (exports de GitHub, `zip -r carpeta/`) envuelven el proyecto entero en una única carpeta de nivel superior. `SafeArchiveExtractor` **nunca mueve ni renombra nada en disco** — la extracción deja el layout exactamente como venía en el ZIP. `resolveProjectRoot` (`workspace/project-root-resolver.ts`) detecta esa carpeta (misma detección: única entrada de nivel superior y es un directorio) de forma puramente lectora y devuelve su ruta absoluta, usada solo por los consumidores que necesitan localizar el proyecto real: `hasPnpmLockfile`, `readPackageJson`/`hasAnyConfigFile` (vía el contexto que reciben los adapters de runner) y el `workingDir` del container de instalación/ejecución (`ContainerRunner`, que sigue montando siempre `workspacePath` completo en `/app`, pero corre el comando con cwd en `/app/<carpeta>` cuando aplica). `ArtifactMaterializer.applyArtifacts` sigue resolviendo `artifact.relativePath` contra `workspacePath` **sin aplanar**, porque Core lo envía relativo a la estructura original del snapshot (envoltorio incluido); un aplanado físico (probado y revertido) desalineaba esas rutas. El ZIP de staging se descarga en `os.tmpdir()` (nombrado por `executionId`), nunca dentro de `workspacePath`, para no contaminar la detección con una entrada de nivel superior que no es parte del proyecto.
- [x] Límites de entradas, bytes y relación de expansión. — `SANDBOX_MAX_ZIP_ENTRIES`/`SANDBOX_MAX_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES`/`SANDBOX_MAX_COMPRESSION_RATIO`.
- [x] Montaje mínimo en container y cleanup idempotente. — un único bind mount del workspace; `WorkspaceManager.cleanup` idempotente en todo camino terminal.
- [x] Sweeper por TTL limitado a la raíz administrada. — `WorkspaceManager.sweepExpired()`, programado por `WorkspaceSweeperService`; solo actúa sobre subdirectorios cuyo nombre es un `executionId` válido bajo la raíz.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
