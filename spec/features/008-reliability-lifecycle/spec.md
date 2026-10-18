# 008-reliability-lifecycle — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU14, HU19, HU24. HU23 está descartada.

## Objetivo

Garantizar cleanup y límites confiables bajo fallos de dependencias, test, timeout o crash parcial.

## Reglas y comportamiento

- Cleanup idempotente.
- Un fallo en cleanup se registra y activa sweeper; no oculta el resultado principal.
- Evitar containers/workspaces huérfanos.
- Health/readiness separa Docker unavailable de app unavailable.
- `GET /health/live` verifica proceso; `GET /health/ready` verifica capacidad de aceptar ejecuciones y reporta dependencias sin revelar configuración sensible.
- Los endpoints health son públicos; todos los endpoints `/executions` conservan Bearer obligatorio.
- El replay de una `requestId` equivalente nunca crea otro container/workspace. Un retry manual real de Core usa otra identidad lógica; no existe autorepair dentro del Sandbox.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.

## Estabilidad del proceso (Fase 3, 2026-10-18)

- **Estado de las ejecuciones persistido y acotado.** Cada ejecución se guarda como `<SANDBOX_EXECUTION_STATE_DIR>/<executionId>.json` y se recarga al arrancar, de modo que `GET /executions/{id}` y `/result` siguen respondiendo tras un reinicio y la idempotencia por `requestId` se restaura desde los archivos. Las ejecuciones terminadas se conservan `SANDBOX_EXECUTION_RETENTION_MS` (24 h por defecto) y, como máximo, `SANDBOX_EXECUTION_MAX_RETAINED` (500); las más antiguas se expulsan de memoria **y del disco**. Las ejecuciones en curso nunca se expulsan.
- **Ejecuciones en curso al reiniciar.** El proceso y sus contenedores murieron, así que no pueden continuar: al recargar, todo registro no terminal se marca `FAILED` con fallo de infraestructura `SANDBOX_RESTARTED` (categoría `INFRASTRUCTURE`, `stage` = la última etapa conocida o `PREPARING`, sin `facts`), y se reescribe en disco. Core obtiene así un resultado terminal en lugar de sondear indefinidamente. No cambia el contrato HTTP: es un `FAILED` ordinario del esquema vigente.
- **Concurrencia.** `SANDBOX_MAX_CONCURRENT_EXECUTIONS` (4 por defecto) limita las ejecuciones simultáneas; las demás esperan en `PENDING`.
- **Contenedores huérfanos.** Al arrancar se eliminan los contenedores `sandbox-<executionId>-*` que dejó un proceso anterior (no puede haber ejecuciones en curso al iniciar). `SANDBOX_RECONCILE_ORPHANS_ON_START=false` lo desactiva.
- **Apagado ordenado.** `enableShutdownHooks()` ejecuta los `onModuleDestroy` (barrido de workspaces) ante SIGTERM/SIGINT; `unhandledRejection` se registra sin apagar y `uncaughtException` apaga de forma ordenada con código 1.
- **Entorno validado.** Un valor numérico o booleano mal escrito impide arrancar y se listan todos los problemas, en lugar de caer en silencio al valor por defecto.


## Persistencia del estado de ejecuciones (WI-SANDBOX-010)

- **Directorio.** `SANDBOX_EXECUTION_STATE_DIR`; por defecto `<home del usuario>/.tjc-sandbox/executions` (persistente; nunca `os.tmpdir()`, que se borra al reiniciar la VM). Nunca se acepta desde un request. Se crea con permisos `0700` y los archivos con `0600`.
- **Formato.** Un archivo JSON por ejecución con `schemaVersion: 1`. Escritura atómica: se escribe a un archivo temporal del mismo directorio y se renombra. Un fallo de escritura se registra con aviso y no tumba la ejecución en curso (el estado en memoria sigue siendo la fuente mientras el proceso vive).
- **Contenido (lista blanca).** Solo lo necesario para responder `GET /executions/{id}` y `/result` y restaurar la idempotencia: `executionId`, `requestId`, `testRunId`, `projectVersionId`, `status`, `stage`, `failureCode`, `failureMessage`, `result` (hechos, fallo, duraciones, `appliedArtifactIds`, evidencia ya acotada), `requestFingerprint`, `scope`, `targetIds`, `executionProfile`, `runnerHint`, `phase` y los cuatro tiempos (`startedAt`, `completedAt`, `createdAt`, `updatedAt`).
- **Redacción del texto libre.** Al serializar, en `failureMessage`, `result.failure.message`, `evidence[].content` y los textos de `testCases` se sustituyen las URLs `http(s)://…` por `[url-redactada]` y las rutas absolutas del host (workspace, `os.tmpdir()`, `os.homedir()` y el directorio de estado) por `[ruta-redactada]`. La respuesta HTTP de un proceso vivo no cambia (texto original); tras un reinicio se sirve la versión redactada.
- **Nunca se persiste:** `snapshot` y `artifacts[].download` (URLs firmadas y capacidades temporales), `projectRoot`, rutas de workspace, token ni encabezados. Las huellas de idempotencia excluyen las URLs por diseño (`INTEROP`, huella sin `url` ni `expiresAt`), así que el replay sigue funcionando.
- **Recarga.** Al arrancar se lee el directorio: un archivo ilegible, con JSON inválido o que no cumple la forma esperada se ignora con un aviso y no impide el arranque; una `schemaVersion` desconocida se ignora con aviso (no se interpreta). Se aplica la retención sobre lo cargado y se elimina del disco lo expirado. Los archivos temporales huérfanos se borran.
- **Registros restaurados.** Un registro terminal restaurado responde igual que antes del reinicio. Los campos de entrada (`snapshot`, `artifacts`, `projectRoot`) no se persisten: un registro restaurado los lleva con valores inertes (`snapshot` sin URL ni capacidad, `artifacts: []`, `projectRoot: '.'`) que ningún camino lee, porque solo el pipeline de una ejecución en curso los necesita y una ejecución restaurada nunca se reanuda.
- **Contenido de un registro marcado `SANDBOX_RESTARTED`.** `status: FAILED`, `stage` = la última etapa conocida o `PREPARING`, `failureCode: SANDBOX_RESTARTED`, `failureMessage` fijo y sin datos del entorno, `startedAt` = el previo o, si nunca arrancó, `createdAt`; `completedAt` = el instante de la recarga; `result = { facts: null, failure: { stage, category: INFRASTRUCTURE, code: SANDBOX_RESTARTED, message }, stageDurations: [], appliedArtifactIds: [], evidence: [] }`. Así `GET /result` responde 200 con el esquema vigente en lugar de `409 EXECUTION_NOT_FINISHED`.
- **Idempotencia tras reinicio.** El replay de un `requestId` persistido con la misma huella devuelve el mismo `executionId` sin lanzar el pipeline (la respuesta de aceptación sigue siendo `PENDING` + `pollAfterMs`, como hoy en todo replay) y con huella distinta devuelve `409 IDEMPOTENCY_CONFLICT`. La huella excluye `url` y `expiresAt`, por lo que no depende de nada que se omita en disco.
- **Cuándo se escribe.** En el alta (`create`) y en cada transición de estado; la evidencia solo existe en el estado terminal. Los registros terminales se escriben una vez más al ser marcados `SANDBOX_RESTARTED` si venían en curso.
- **Defensas en la recarga.** El nombre del archivo debe ser `<UUID>.json` y su `executionId` interno debe coincidir con el nombre; no se sigue ningún symlink ni se lee fuera del directorio. Un archivo mayor que `4 MiB` se ignora con aviso (la evidencia ya está acotada).
- **Directorio inutilizable.** Si el directorio de estado no se puede crear o usar (permisos, disco), el proceso no arranca y lo dice con un mensaje claro: continuar en memoria reintroduciría en silencio la pérdida de estado que este WI elimina. Solo los problemas dentro de un archivo individual producen un aviso. Un `requestId` duplicado en dos archivos (solo por edición manual) gana el último cargado.
- **Residual aceptado.** Otro contenido libre que imprima el código del proyecto bajo prueba (acotado a 500 B y 8 KiB) puede quedar en reposo en un directorio `0700` con la misma retención. Quedan como residual conocido, sin implementar: los archivos inválidos no se borran ni cuentan para la retención; `removeTemporaryFiles` borra cualquier `*.tmp` del directorio de estado (que es exclusivo del Sandbox); no hay `fsync` del directorio tras el `rename`; el reconciliador de huérfanos corre en segundo plano y podría, en una ventana estrecha, eliminar un contenedor de una ejecución recién aceptada; y la cola de concurrencia y las ejecuciones `PENDING` no tienen cota de admisión. También quedan sin prueba el cableado de `sensitiveHostPaths` en el módulo y la inclusión del directorio de estado entre las rutas redactadas, y la redacción no cubre rutas con espacios más allá del prefijo del host, diferencias de mayúsculas, rutas Windows ni esquemas distintos de http/https. Ninguno afecta al contrato.

### Estado de lifecycle formal

`PENDING → PREPARING → INSTALLING_DEPENDENCIES → COMPILING → RUNNING_TESTS → FINALIZING → {COMPLETED | FAILED | TIMED_OUT}`. `PENDING` espera un hueco de concurrencia. Cualquier etapa puede terminar en `FAILED`/`TIMED_OUT`. Un reinicio del proceso convierte todo estado no terminal en `FAILED` con `SANDBOX_RESTARTED` (fuera de la secuencia normal). Los estados terminales son inmutables.
