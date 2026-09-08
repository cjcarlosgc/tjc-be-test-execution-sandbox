# Revisión de work item — aplanado de carpeta contenedora única al extraer

**Fecha:** 2026-09-07

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08 (materialización de snapshot/artefactos) y la capacidad transversal `temporary-workspaces` (extracción segura del ZIP), sin HU dedicada propia.
- Contexto: Core, en sus propias pruebas de integración local, encontró que `readPackageJson`, `hasAnyConfigFile` y `hasPnpmLockfile` asumen que el proyecto vive directamente en la raíz del workspace, sin resolver la carpeta raíz real cuando el snapshot viene envuelto en una única carpeta contenedora de nivel superior (patrón común de exports de GitHub, `zip -r carpeta/`). Core sugirió explícitamente que lo más robusto era resolverlo en `SafeArchiveExtractor` (o un paso posterior a la extracción) detectando y aplanando esa carpeta, en vez de parchear cada chequeo downstream por separado — se siguió esa sugerencia.
- Por qué se centraliza en el extractor y no en cada chequeo: además de los tres chequeos que reportó Core, `ArtifactMaterializer.applyArtifacts` también resuelve `relativePath` de cada artefacto directamente contra la raíz del workspace (`WorkspaceManager.resolveWithin(workspacePath, artifact.relativePath)`) — si se hubiera parchado cada consumidor por separado, ese cuarto punto habría quedado con el mismo bug sin nadie notarlo hasta que un artefacto con `relativePath` real fallara en materializarse dentro de la carpeta contenedora en vez de en la raíz esperada por Core.

## Cambios

- `workspace/safe-archive-extractor.ts`: nuevo método privado `flattenSingleTopLevelDirectory(root)`, invocado al final de `extract()` después de que toda la extracción (con sus defensas Zip Slip/symlink/zip-bomb existentes) terminó. Lee las entradas de nivel superior de la raíz del workspace; si hay exactamente una y es un directorio, mueve (`fs.rename`) todo su contenido un nivel arriba y elimina (`fs.rmdir`) la carpeta ya vacía. No hace nada si hay múltiples entradas de nivel superior (proyecto ya plano) o si la única entrada es un archivo, no un directorio.
- `workspace/safe-archive-extractor.spec.ts`: 3 casos nuevos — aplana una carpeta única con `package.json`/`src/index.ts` anidados y confirma que la carpeta contenedora ya no existe; no aplana cuando hay dos entradas de nivel superior (`package.json` + `README.md`, sigue igual que antes); no aplana cuando la única entrada de nivel superior es un archivo suelto.
- `spec/transversal/temporary-workspaces/tasks.md`: nota agregada al ítem de rutas seguras/`SafeArchiveExtractor` explicando el mecanismo y por qué se centralizó ahí.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 129/129 verdes (incluye los 3 casos nuevos de `safe-archive-extractor.spec.ts`; se confirmó consistencia con una segunda corrida tras un flake aislado de un test de integración Docker no relacionado con este cambio).
- `pnpm test:e2e`: 16/16 verdes con Docker Desktop real — sin regresión en el flujo real de descarga HTTPS + `pnpm install` + `vitest run` dentro de container, que ya ejercitaba proyectos con estructura plana.
- Servicio realmente levantado (`pnpm start:dev`, puerto 3001) y `GET /health/ready` verificado en `200 ready` tras el cambio.

## Manejo de errores y seguridad

- El aplanado corre después de que todas las defensas existentes de `extract()` ya se aplicaron entrada por entrada (Zip Slip, rutas absolutas, symlinks, límites de entradas/bytes/ratio de compresión) — no introduce una superficie nueva de validación, solo reordena archivos ya extraídos y validados dentro de la raíz ya confinada del workspace.
- `fs.rename` se usa dentro del mismo filesystem/directorio raíz (nunca cruza la raíz del workspace), y el nombre de la carpeta contenedora nunca se usa para construir una ruta fuera de `root` — se lee de `fs.readdir`, no del nombre de entrada del ZIP sin validar.

## Observabilidad mínima

- Sin cambios: es un paso silencioso de normalización de estructura, no un punto de fallo reportable — si algo dentro de él fallara (p. ej. permisos), se propagaría como excepción no capturada durante `PREPARING`, igual que cualquier otro error de filesystem en `extract()`.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. El usuario ya autorizó commits en general pero explícitamente pidió no hacer push todavía ("no pushees aun").
