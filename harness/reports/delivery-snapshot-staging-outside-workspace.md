# Revisión de work item — ZIP de staging fuera del workspace (regresión sobre el aplanado)

**Fecha:** 2026-09-07

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, y la capacidad transversal `temporary-workspaces` (extracción/staging del ZIP), mismo work item que `delivery-single-top-level-folder-flatten.md`.
- Contexto: inmediatamente después de commitear el aplanado de carpeta contenedora única (`7955609`), Core encontró que ese fix no funcionaba en el caso real que debía resolver, porque interactuaba mal con el mecanismo de staging ya existente: `snapshotZipPath` se descargaba dentro de `workspacePath` (el mismo directorio que `SafeArchiveExtractor.extract()` recibe como destino), y `fs.rm(snapshotZipPath)` corría recién *después* de `extract()` — es decir, después de que el aplanado ya había mirado el contenido de la raíz. Con un proyecto envuelto en una única carpeta, la raíz quedaba con dos entradas de nivel superior (el ZIP + la carpeta), no una, así que `flattenSingleTopLevelDirectory` nunca se disparaba: el bug seguía presente en el caso exacto que originó el fix anterior.
- Core sugirió dos alternativas: mover el `fs.rm` para que ocurra antes del aplanado, o (más limpio) descargar el ZIP a un staging fuera de `workspacePath`. Se adoptó la segunda, por ser la más robusta: no depende de que nadie recuerde mantener un orden correcto entre descarga/extracción/borrado en el futuro, y elimina la clase entera de interacción staging-vs-aplanado en la raíz.

## Cambios

- `executions/execution-pipeline.service.ts`:
  - `snapshotZipPath` ahora se construye con `path.join(os.tmpdir(), 'sandbox-snapshot-' + executionId + '.zip')` en vez de `path.join(workspacePath, SNAPSHOT_STAGING_FILENAME)`. Nombrado por `executionId` (siempre un UUID) para evitar colisiones entre ejecuciones concurrentes en el mismo `os.tmpdir()` compartido.
  - La descarga + extracción quedan envueltas en un `try { ... } finally { await fs.rm(snapshotZipPath, { force: true }); }`, para que el archivo de staging se borre tanto si la descarga o la extracción fallan como si tienen éxito. Antes, el borrado dependía implícitamente de que el ZIP viviera dentro de `workspacePath`, que ya se limpia entero (`workspaceManager.cleanup`) en cualquier camino de error del `catch` general de `execute()`; al sacarlo del workspace, ese borrado automático dejó de aplicar y había que hacerlo explícito.
  - Constante renombrada de `SNAPSHOT_STAGING_FILENAME` a `SNAPSHOT_STAGING_PREFIX` para reflejar que ahora se compone con el `executionId`, no un nombre fijo.
- `executions/execution-pipeline.service.spec.ts`: nueva prueba de regresión que ejercita exactamente la combinación donde vivía el bug — un `downloadToFile` fake que escribe un ZIP real (construido con `yazl`, vía un helper `buildZip` local) en la ruta que le pasa el pipeline (no una ruta fija), envuelto en `my-project/`, combinado con una instancia *real* de `SafeArchiveExtractor` (no un fake). Antes de este fix, esta prueba habría fallado con `UNSUPPORTED_PACKAGE_MANAGER` a pesar de que el proyecto sí declara `pnpm-lock.yaml`. También se amplió el tipo de las opciones `downloadToFile`/`extract` del helper `build()` de este spec (antes `() => Promise<...>` sin parámetros, ahora con la firma real) para poder observar/interceptar la ruta de destino y delegar en un extractor real.
- `spec/transversal/temporary-workspaces/tasks.md`: la nota sobre el aplanado se amplía para documentar por qué el staging vive en `os.tmpdir()` y no dentro del workspace.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 130/130 verdes (agrega la prueba de regresión descrita arriba).
- `pnpm test:e2e`: 16/16 verdes con Docker Desktop real — el flujo real de descarga HTTPS + extracción + `pnpm install`/`vitest run` dentro de container sigue intacto (los fixtures de ese suite no están envueltos en una carpeta contenedora, así que no ejercitan este caso puntual; la cobertura de esa combinación específica queda en la nueva prueba unitaria con extractor real + descarga real).
- Servicio realmente levantado (`pnpm start:dev`, puerto 3001) y `GET /health/ready` verificado en `200 ready` tras el cambio.

## Manejo de errores y seguridad

- El `try/finally` garantiza que ningún ZIP de staging quede huérfano en `os.tmpdir()` ni siquiera cuando la descarga falla a mitad de camino o la extracción lanza (`InvalidArchiveError`, Zip Slip, etc.) — `fs.rm(..., { force: true })` no falla si el archivo nunca llegó a crearse.
- El nombre del archivo de staging se deriva de `executionId` (UUID validado, nunca del request en crudo), por lo que no hay superficie nueva de path traversal en `os.tmpdir()`.

## Observabilidad mínima

- Sin cambios: el fallo, si ocurre, sigue reportándose vía el mecanismo existente de `SandboxFactError` durante `PREPARING`.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. El usuario ya autorizó commits en general pero explícitamente pidió no hacer push todavía ("no pushees aun").
