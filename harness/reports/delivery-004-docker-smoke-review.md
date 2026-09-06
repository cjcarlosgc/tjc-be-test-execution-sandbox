# Revisión de work item — 004-container-execution (Docker smoke execution)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU23 (`spec/features/004-container-execution/spec.md`).
- Decisión evaluada: `DEC-SBX-002` (PENDING) bloquea explícitamente solo "implementación de instalación de dependencias en 004-container-execution", no el resto de la feature. Se implementa todo lo no bloqueado; "install/compile/test commands seguros" queda sin marcar en `tasks.md` con la razón documentada.
- Implementado — `ContainerRunner` (dockerode, nunca `docker` CLI):
  - Cliente Docker vía token de inyección (`DOCKER_CLIENT`), configurable por host/puerto o socket (destino remoto futuro sujeto a `DEC-INF-001`, sin cambiar código).
  - Selección de imagen/runtime Node configurable (`SANDBOX_DEFAULT_NODE_IMAGE`), nunca fija.
  - `ensureImage`: usa la imagen cacheada localmente o hace `pull` y espera su finalización.
  - Límites: memoria, `NanoCpus`, `PidsLimit`, sin red (`NetworkMode: none`), sin privilegios, `CapDrop: ALL`, `no-new-privileges`, workspace montado **solo lectura** en `/app` (no se monta la raíz del host, credenciales ni Docker socket).
  - Timeout configurable: al vencer, mata el container y marca `timedOut=true`.
  - El container siempre se elimina (`force: true`) en un `finally`, incluso si `start()` falla.
  - Ejecuta un comando fijo del propio Sandbox (`node --version`), nunca uno suministrado por Core ni derivado del proyecto — es un "Docker smoke execution" (roadmap Sprint 1), no la ejecución real de tests.
- Explícitamente fuera de alcance por `DEC-SBX-002`: detección/instalación del package manager del proyecto, compilación real y ejecución de Jest/Vitest. Esa etapa depende de resolver la decisión y de `005-test-runner-adapters`.
- No se wireó `ContainerModule` dentro del pipeline de `001`/`002`/`003`: hacerlo requeriría reportar `stage=INSTALLING_DEPENDENCIES` (bloqueado) o inventar un valor de `SandboxStage` no contractual. Queda como capacidad standalone, lista para conectarse cuando `DEC-SBX-002` se resuelva o para exponerse vía `GET /health/ready` (008-reliability-lifecycle), decisión que no corresponde tomar aquí.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores. Se resolvió además un bloqueo de `pnpm install`: `pnpm-workspace.yaml` traía placeholders `allowBuilds` sin decidir para `cpu-features`/`protobufjs`/`ssh2` (dependencias opcionales de `docker-modem` para transporte SSH); se fijaron explícitamente en `false` porque el Sandbox solo conecta por socket/TCP, verificado con `dockerode.ping()` funcionando sin esos builds nativos.
- `pnpm test` (vitest, unit): 68/68 verdes, incluyendo `container-runner.service.spec.ts` (comando exitoso, límites/mount aplicados al `HostConfig`, timeout mata y limpia, `pull` cuando la imagen no está cacheada, limpieza incluso si `start()` falla) con un Docker fake inyectado (sin red/daemon real).
- **Integración real con Docker Engine** (`container-runner.integration.spec.ts`, se omite automáticamente si el daemon no está accesible): contra la MacBook con Docker Desktop del entorno aprobado (`architecture.md`), crea, ejecuta, captura `stdout` (`node --version`) y elimina un container real; se confirmó que no queda residuo (`docker.listContainers` no lo incluye tras la ejecución). Verificado en esta sesión con Docker Desktop activo (`node:22-slim` descargada localmente).

## Manejo de errores y seguridad

- `container-isolation` transversal: sin `--privileged`, sin Docker socket dentro del container, sin montar el filesystem del host más allá del workspace (y de solo lectura), `CapDrop: ALL`, `no-new-privileges`, sin red para el comando ejecutado.
- `resource-limits` transversal: memoria/CPU/PIDs/timeout configurables por entorno vía `ConfigService`, nunca elevables por el request (el smoke check no acepta ningún parámetro del caller más allá de `executionId`/`workspacePath`).
- Cleanup garantizado: `container.remove({force:true})` en `finally`, cubierto por test incluso cuando `start()` lanza.

## Observabilidad mínima

- Se registra `executionId`, imagen, `exitCode`, `timedOut` y duración; nunca el contenido de stdout/stderr ni rutas del host más allá del workspace ya conocido.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
