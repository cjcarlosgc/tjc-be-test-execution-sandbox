# Revisión de work item — guarda de disco a nivel de aplicación (overlay2)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19 (misma capacidad transversal de `resource-limits` que el endurecimiento previo, sin HU dedicada propia).
- Contexto: el usuario se preparaba para probar en local (frontend + RAG Core + Sandbox, todos sobre Docker Desktop) y expresó preocupación por una limitación ya documentada en `spec/transversal/resource-limits/tasks.md`: `HostConfig.DiskQuota` de Docker solo funciona con el storage driver `devicemapper`, no con `overlay2` (el default de Docker Desktop, el entorno aprobado). En vez de dejarlo únicamente como limitación documentada, se cerró con una guarda real a nivel de aplicación.
- Alcance deliberadamente acotado: la guarda mide el workspace **una sola vez**, justo después de que `pnpm install` termina con éxito (el momento de mayor riesgo, por `node_modules`), no continuamente durante `RUNNING_TESTS`. Esta es una limitación residual conocida y aceptada, no un hueco sin detectar: el límite de tiempo/CPU/memoria del container sigue siendo la defensa para un test que genere archivos en tiempo de ejecución.

## Cambios

- `workspace/workspace-manager.ts`: nuevo `calculateDirectorySize(dirPath): Promise<number>` — recorre recursivamente con `fs.readdir(..., { withFileTypes: true })`, no sigue symlinks (evita ciclos con el layout de `node_modules` de pnpm), devuelve `0` si el directorio ya no existe (`ENOENT`).
- `common/config/sandbox-limits.config.ts`: nuevo `maxWorkspaceBytes` (`SANDBOX_MAX_WORKSPACE_BYTES`, default 2 GiB).
- `common/errors/sandbox-fact-error.ts`: nuevo `WorkspaceDiskLimitExceededError` (`WORKSPACE_DISK_LIMIT_EXCEEDED`/`INFRASTRUCTURE`).
- `executions/execution-pipeline.service.ts`: tras `INSTALLING_DEPENDENCIES` exitoso y antes de `RUNNING_TESTS`, invoca `workspaceManager.calculateDirectorySize(workspacePath)` y falla la ejecución si excede `maxWorkspaceBytes`, sin llegar a correr ningún test.
- `app/.env.example`: documenta `SANDBOX_MAX_WORKSPACE_BYTES` con la explicación del porqué (overlay2 vs devicemapper).
- `spec/transversal/resource-limits/tasks.md`: la nota sobre `HostConfig.DiskQuota` se actualiza de "limitación sin mitigar" a "limitación de Docker + guarda de aplicación que la cierra", describiendo el mecanismo.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 118/118 verdes. Nuevo en `workspace-manager.spec.ts`: tamaño recursivo de un árbol con subdirectorio, symlink no seguido (sin ciclo), directorio inexistente devuelve 0. Nuevo en `execution-pipeline.service.spec.ts`: instalación que hace crecer el workspace por encima de `SANDBOX_MAX_WORKSPACE_BYTES` produce `FAILED`/`WORKSPACE_DISK_LIMIT_EXCEEDED`/`INFRASTRUCTURE` en la etapa `INSTALLING_DEPENDENCIES`, y `runTestCommand` nunca se invoca.
- `pnpm test:e2e`: 16/16 verdes, con Docker Desktop real (`docker info` confirmado arriba).

## Manejo de errores y seguridad

- El límite se lee exclusivamente de `ConfigService` (`SANDBOX_MAX_WORKSPACE_BYTES`), nunca del request de Core — consistente con el resto de límites de `resource-limits`.
- `WORKSPACE_DISK_LIMIT_EXCEEDED` usa categoría `INFRASTRUCTURE`, igual que `OOM_KILLED`, dándole a Core una señal de límite de plataforma distinta de un fallo lógico del proyecto ejecutado.
- `calculateDirectorySize` no sigue symlinks, evitando que un proyecto malicioso con un symlink circular en `node_modules` cause una recursión infinita o inflación artificial de conteo.

## Observabilidad mínima

- El fallo se reporta con el mismo mecanismo de `SandboxFactError` que el resto de fallos de infraestructura (stage/category/code consistentes), sin necesidad de logging adicional dedicado.

## Hallazgos

Ninguno abierto. Limitación residual conocida y documentada (ver "Alcance y trazabilidad"): medición puntual post-install, no continua durante `RUNNING_TESTS`.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. El usuario ya autorizó commits en general pero explícitamente pidió no hacer push todavía ("no pushees aun").
