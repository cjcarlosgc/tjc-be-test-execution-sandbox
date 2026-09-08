# Revisión de work item — detección de raíz del proyecto sin aplanado físico

**Fecha:** 2026-09-07

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, y la capacidad transversal `temporary-workspaces`, tercer capítulo del mismo work item que `delivery-single-top-level-folder-flatten.md` y `delivery-snapshot-staging-outside-workspace.md`.
- Contexto: Core identificó que el aplanado físico (mover/renombrar archivos) introducido para resolver la detección de carpeta contenedora única era, en sí mismo, la causa raíz de la segunda regresión — no solo un detalle de dónde vivía el ZIP de staging. Al mover el contenido de la carpeta contenedora un nivel arriba, `artifact.relativePath` (que Core sigue enviando relativo a la estructura *original* del snapshot, envoltorio incluido) dejaba de corresponder con la ubicación real de los archivos, así que `ArtifactMaterializer` escribía artefactos `MODIFIED`/`CREATED` en una ruta que ya no representaba nada real.
- Solución adoptada, siguiendo la propuesta de Core: no tocar el layout físico del workspace en ningún momento. En su lugar, detectar la carpeta raíz real del proyecto (misma detección: única entrada de nivel superior y es un directorio) y usar esa ruta resuelta *solo* para los cuatro consumidores que necesitan localizar el proyecto real — nunca para resolver artefactos.

## Cambios

- `workspace/safe-archive-extractor.ts` y `workspace/safe-archive-extractor.spec.ts`: revertidos al estado previo a `flattenSingleTopLevelDirectory` (commit `7955609`). `extract()` vuelve a ser una extracción pura, sin efectos secundarios sobre el layout.
- `workspace/project-root-resolver.ts` (nuevo): `resolveProjectRoot(workspacePath)`, detección de solo lectura — lee las entradas de nivel superior con `fs.readdir`, nunca mueve/renombra nada. Devuelve la ruta absoluta a la única carpeta contenedora si existe, o `workspacePath` sin cambios en cualquier otro caso.
- `container/container-runner.service.ts`: `RunContainerOptions` gana `workingDir` (antes `WorkingDir: '/app'` estaba hardcodeado en `createContainer`). `installDependencies`/`runTestCommand` aceptan un `workingDir` opcional (default `/app`, vía `DEFAULT_CONTAINER_WORKING_DIR`). El bind mount (`Binds`) no cambia — siempre expone todo `workspacePath` en `/app`; solo cambia el cwd del comando dentro del container.
- `executions/execution-pipeline.service.ts`: calcula `projectRoot = await resolveProjectRoot(workspacePath)` una sola vez, justo después de extraer (antes de `applyArtifacts`). Nuevo método privado `toContainerWorkingDir(workspacePath, projectRoot)` traduce esa ruta host a la ruta equivalente dentro del container (`/app` o `/app/<carpeta>`). `projectRoot` se usa en: `hasPnpmLockfile(projectRoot)`, el contexto pasado a `runnerAdapterRegistry.resolve()`/`adapter.buildCommand()` (campo `workspacePath` del `ProjectRunnerContext`, que ahora recibe la ruta resuelta), y como `workingDir` en `installDependencies`/`runTestCommand`. **`artifactMaterializer.applyArtifacts(workspacePath, ...)` no se tocó** — sigue resolviendo `relativePath` contra `workspacePath` en crudo, exactamente como antes de que existiera cualquier aplanado.
- `container/container-runner.service.spec.ts`: 2 casos nuevos — `installDependencies` con `workingDir` explícito produce `WorkingDir` correcto sin alterar `Binds`; sin `workingDir`, el default sigue siendo `/app`.
- `workspace/project-root-resolver.spec.ts` (nuevo): 4 casos — carpeta única (sin mover nada), múltiples entradas de nivel superior, una única entrada que es un archivo, workspace vacío.
- `executions/execution-pipeline.service.spec.ts`: el test de regresión de la entrega anterior se refuerza para usar un `RunnerAdapterRegistry` real con `VitestTestRunnerAdapter`/`JestTestRunnerAdapter` reales (no el fake que ignora el contexto), de modo que `readPackageJson`/`hasAnyConfigFile` — invocados dentro de `supports()` — se ejerciten de verdad contra la ruta resuelta. La aserción cambia de "el archivo aparece en la raíz" (comportamiento del aplanado físico, ya revertido) a "el archivo sigue exactamente donde la extracción lo dejó, envoltorio incluido" (`workspaceDir/my-project/package.json`, y explícitamente NO en `workspaceDir/package.json`).
- `test/support/zip-fixture.ts`: `buildZipFixtureFromDir` gana un parámetro opcional `wrapInFolder` para envolver todas las entradas bajo una carpeta, simulando el patrón real de exports de GitHub.
- `test/full-pipeline.e2e-spec.ts`: nuevo test real con Docker — construye el mismo fixture real (`vitest-sample-project`) envuelto en `my-project/`, lo sirve por HTTPS, y confirma que el pipeline completo (descarga real + extracción real + `pnpm install` real + `vitest run` real, todo en Docker) llega a `COMPLETED`/`passed=true`. Esta es la única prueba que puede demostrar de verdad que `node_modules/.bin/vitest` (ruta relativa en `buildCommand`) se resuelve correctamente contra el `WorkingDir` real que Docker le da al container — un mock nunca habría podido exponer esto, tal como ya había pasado con el bug de path host/container de una entrega anterior.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 133/133 verdes.
- `pnpm test:e2e`: 17/17 verdes con Docker Desktop real (16 previos + el nuevo caso de proyecto envuelto).
- Servicio realmente levantado (`pnpm start:dev`, puerto 3001) y `GET /health/ready` verificado en `200 ready`.

## Manejo de errores y seguridad

- `resolveProjectRoot` es puramente lectora (`fs.readdir`, sin `fs.rename`/`fs.rmdir`); no hay superficie nueva de escritura ni de path traversal — la ruta que devuelve siempre es `workspacePath` o un hijo directo suyo, nunca derivada de una entrada de ZIP sin validar.
- El bind mount de Docker (`HostConfig.Binds`) es idéntico en todos los casos — el fix solo cambia el `WorkingDir` (cwd del comando), nunca qué directorio se monta ni con qué permisos.

## Observabilidad mínima

- Sin cambios: el comportamiento sigue siendo transparente para el modelo de fallos existente (`SandboxFactError`); no hay un nuevo punto de fallo reportable, solo una resolución de ruta más precisa antes de los chequeos ya existentes.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. El usuario ya autorizó commits en general pero explícitamente pidió no hacer push todavía ("no pushees aun").
