Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revisión independiente WI-SANDBOX-010

Veredicto: **CHANGES_REQUESTED** (0 BLOCKER, 1 MAJOR, 6 MINOR)

Alcance: `git diff 3a8f8d6..HEAD -- app spec` (3832a2b, ccf9296) y el código de 3a8f8d6. Fuente de verdad: spec 008 («Estabilidad del proceso», «Persistencia del estado de ejecuciones») y `wi-sandbox-010-sdd-analysis.md`.

## Evidencia de comandos (ejecutados por el revisor)
- `pnpm lint` (app): OK, sin hallazgos.
- `pnpm test` (app): 33 archivos pasan, 1 skip; 264 pasan, 4 skip (skips = Docker/ACL Linux, condicionales).
- `pnpm build`: OK. `pnpm contracts:check`: OK.
- `pnpm test:e2e`: 2 archivos pasan, 1 skip (Docker); 15 pasan, 6 skip.
- `node scripts/sdd-check.mjs`: OK. `validate-work-items`: OK. `validate-harness`: OK. `validate-completions`: OK.
- `git diff 3a8f8d6..HEAD -- spec/contracts`: vacío (0 líneas). Contrato HTTP sin cambios; `getStatus`/`getResult` (executions.service.ts) no se tocaron.

## Criterios de aceptación
1. Persistencia JSON atómica y recarga, archivo corrupto ignorado: CUMPLE. `file-execution.repository.ts` persist (open `wx` 0600, write, fsync, rename), onModuleInit/loadFile (try/catch por archivo). Dir por defecto `~/.tjc-sandbox/executions`.
2. Sin snapshot/URLs/rutas en disco: CUMPLE para los campos de entrada; NO plenamente para texto libre (ver M1). `serializeExecutionRecord` (execution-state.codec.ts) construye cada campo a mano (lista blanca real, sin spread). Único escritor: `persist` (único `writeSync`; `save` y la recarga pasan por él). Los `save` del pipeline hacen `{...record}` pero el codec descarta lo no listado.
3. Retención también en disco: CUMPLE (`remove` -> `onEvicted` -> `unlinkSync`; también en la recarga vía `evict()`). Prueba específica.
4. SANDBOX_RESTARTED: CUMPLE. `markInterruptedAsRestarted` fija `startedAt = previo ?? createdAt` y `completedAt = ahora`, por lo que `/result` da 200 (probado en executions.persistence.spec.ts). Idempotencia tras reinicio probada (re-firma de URL con misma huella y huella distinta -> 409).
5. Repositorio acotado, tope de concurrencia, reconciliación: CUMPLE (ver m5, m6 como matices).
6. `enableShutdownHooks()` (main.ts) y lifecycle en spec: CUMPLE.
7. Validación de entorno (incluye `SANDBOX_EXECUTION_STATE_DIR` como ruta absoluta) y `.env.example` con `SANDBOX_PNPM_STORE_VOLUME`: CUMPLE.
8. Contrato inmutable y gates: CUMPLE (ver evidencia).

## Hallazgos

### MAJOR
**M1. Texto libre persistido puede contener rutas del host o URLs, contra AC2 y la spec («Nunca se persiste ... rutas de workspace»).**
`failureMessage`, `result.failure.message` y `evidence[].content` se copian tal cual (execution-state.codec.ts, serialize; `resultFacts` solo valida forma). Caminos alcanzables: el fallback `UNKNOWN` del pipeline usa `error.message` crudo (execution-pipeline.service.ts `toFailureFact`), y `InputDownloadFailedError(lastError.message)` (workspace/execution-input-download.service.ts:108) puede incluir errores de fs con la ruta del scratch `os.tmpdir()/sandbox-snapshot-<id>.zip` o del workspace; también `InvalidArtifactPathError` con `workspacePath` (workspace-manager.ts:299/313) y `relativePath`. La spec declara como residual aceptado solo el texto impreso por el proyecto bajo prueba, y afirma explícitamente que no se persisten rutas del host. La prueba de seguridad (file-execution.repository.spec.ts:222-247) solo cubre `snapshot`/`artifacts[].download`/`projectRoot`, no `failureMessage`/`evidence`, por lo que la garantía no está verificada.
Propuesta (cualquiera de las dos, a decisión del implementer): (a) en `serializeExecutionRecord`, redactar en `failureMessage`/`failure.message` patrones `https?://\S+` y rutas absolutas del host (workspaceRoot, `os.tmpdir()`, `homedir()`), y añadir una prueba con `failureMessage` que contenga `https://...?X-Signature=` y una ruta del workspace; o (b) reescribir la spec/AC para declarar que los mensajes de fallo sin sanear son residual aceptado (y retirar la afirmación de «rutas del workspace del host»), registrándolo como decisión.

### MINOR
- **m1.** Efecto colateral de pruebas: `test/health.e2e-spec.ts` levanta `AppModule` sin fijar `SANDBOX_EXECUTION_STATE_DIR`, así que `pnpm test:e2e` crea `~/.tjc-sandbox/executions` en el home real (verificado; el revisor lo borró). Propuesta: mkdtemp y limpieza como en los otros dos e2e.
- **m2.** La prueba «un directorio que es un archivo impide arrancar con un mensaje claro» (file-execution.repository.spec.ts:285) solo hace `.toThrow()`, sin comprobar el mensaje; además `mkdirSync(recursive)` lanza antes un `EEXIST` crudo (verificado), de modo que el mensaje «existe y no es un directorio» de `ensureDirectory` es código inalcanzable en ese caso, y el error de permisos también es crudo. Propuesta: envolver `ensureDirectory` en try/catch que relance `Error('No se puede usar SANDBOX_EXECUTION_STATE_DIR=<dir>: <causa>')` y afirmar el mensaje en la prueba.
- **m3.** Archivos inválidos/corruptos o no `<uuid>.json` se ignoran pero nunca se borran ni cuentan para la retención: crecimiento del directorio sin cota si se repiten. `removeTemporaryFiles` borra además cualquier `*.tmp` ajeno del directorio y `ensureDirectory` hace `chmod 0700` sobre un directorio configurado por el operador, que puede ser compartido. Propuesta: documentar, o mover lo inválido a `quarantine/`/borrarlo tras el TTL; limitar el borrado de `.tmp` al patrón `.<uuid>.<uuid>.tmp`.
- **m4.** Sin `fsync` del directorio tras `renameSync`: tras un corte de energía la renombración puede perderse (el archivo previo o ninguno). Aceptable para este uso, pero la spec dice «atómica»; documentarlo o hacer fsync del dir.
- **m5.** `OrphanContainerReconciler.onModuleInit` lanza `reconcile()` con `void`, sin esperar. Una ejecución aceptada en cuanto se escuche el puerto podría crear un contenedor `sandbox-<uuid>-*` que la reconciliación en curso borre (el regex no distingue). Ventana estrecha. Propuesta: esperar la reconciliación (con timeout) antes de escuchar, o filtrar por `Created < arranque del proceso`.
- **m6.** La cola de espera del tope de concurrencia (`withSlot`) y las ejecuciones en curso no tienen cota de admisión; bajo ráfaga, `PENDING` crece en memoria/disco (las no terminales nunca se expulsan). Es una decisión de producto; al menos anotarla como residual en la spec. Además `plan.md` menciona `ExecutionStateSerializer` y escritura «encolada por ejecución», pero la implementación son funciones puras y escritura síncrona; alinear el texto.

## Aspectos verificados sin hallazgo
- Path traversal/symlink/TOCTOU: nombre estricto `<uuid>.json`, `lstat` + `O_NOFOLLOW` + `fstat` sobre el descriptor + tope de 4 MiB, coincidencia nombre/executionId; escritura con tmp `wx` y `rename` (no sigue un symlink en destino; un `unlink` de symlink solo quita el enlace); `persist` rechaza ids no UUID. Probado el caso symlink.
- Permisos 0700/0600 probados. Fallo de escritura en caliente no tumba la ejecución; probado.
- Carreras: `save` y `persist` síncronos en un hilo, sin intercalado por registro; el mismo registro guardado varias veces deja siempre el último estado.
- Orden: el repositorio carga en `onModuleInit` (comprobado con `Test.createTestingModule` + factoría, que prueba que Nest invoca el hook); `listen` ocurre después de `NestFactory.create` (main.ts); el reconciliador no depende del repositorio.
- `process-safety`, `enableShutdownHooks`, CI (`app/.nvmrc` existe = 22, `engines >=22 <23`, `corepack enable`, `packageManager` pnpm@12.14.0, `contracts:check`/lint/build/test, permisos `contents: read`) sin problemas evidentes. No hay `.nvmrc` en la raíz; el workflow usa `app/.nvmrc` en ambos jobs, coherente.
- Pruebas: no se detectaron pruebas vacuas; las de reinicio recrean repositorio y servicio sobre el mismo directorio (reinicio real), la de seguridad inspecciona el contenido de los archivos. La única debilidad es la cobertura de texto libre (M1) y m2.

## Archivos revisados
app/src/executions/{file-execution.repository.ts,execution-state.codec.ts,execution.repository.ts,executions.module.ts,executions.service.ts,execution-pipeline.service.ts}, app/src/common/config/env.validation.ts, app/src/main.ts, app/src/common/process-safety.ts, app/src/container/orphan-container-reconciler.service.ts, app/.env.example, .github/workflows/ci.yml, app/test/*.e2e-spec.ts, spec/features/008-reliability-lifecycle/*, y sus pruebas.

## Siguiente paso recomendado
El implementer resuelve M1 (redacción en el serializador con prueba, o decisión explícita que ajuste AC/spec) y, preferiblemente, m1 y m2 (baratos). Luego nueva revisión acotada al delta.
