# Revisión independiente — WI-SANDBOX-005 (ACL del workspace para PHP no-root)

Fecha: 2026-10-12  
Veredicto: `CHANGES_REQUESTED`  
Reviewer: `reviewer`; revisión estática del working tree sin modificar código, sin `pnpm build`/`nest build`, sin Docker/e2e y sin reiniciar nada.

## Verificaciones ejecutadas

- `cd app && pnpm -s lint`: sin errores.
- `cd app && pnpm -s test`: 25 archivos, 201 passed, **2 skipped** (203). Los 2 skipped son las únicas pruebas con ACL reales (`grants UID 10001 access...` y `restores host access after untrusted chmod...`): requieren Linux, root, `setfacl`/`getfacl`/`setpriv`. Este host es macOS sin `setfacl`.
- `npx tsc --noEmit -p tsconfig.build.json`: sin errores.
- Alcance: código solo bajo `app/` (workspace-manager, container-runner, execution-pipeline, Dockerfile PHP, script `restore-workspace-acl`, specs); más `spec/features/009-*`, `CHANGELOG.md`, `harness/state.json`. No hay cambios de contrato, SDD 2.1, SYSTEM-2.2, INTEROP-2.8, VM ni firewall.
- Secretos: ninguno. Shell injection: `execFile` con arreglo de argumentos en el host; el script valida UID numérico y fija `/app`; `find -P -type d|f` no sigue symlinks. Sin hallazgos. Red/capabilities de la recuperación: `network:false`, `CapDrop:['ALL']`, sin `CapAdd`, usuario `sandbox`, solo el bind del workspace. Correcto.

## Hallazgos bloqueantes

### B1 (alta) — `restore-workspace-acl` falla de forma determinista dentro del contenedor
`setfacl` solo puede modificar ACL de objetos que el proceso posee (o con `CAP_FOWNER`). El script corre como UID 10001 con `CapDrop: ALL`, pero `find -P /app ... -type d|f -exec setfacl` incluye:
- la raíz `/app`, creada por el host (no propiedad de 10001), y
- los archivos/directorios materializados por el host (snapshot y artefactos).

`setfacl` devuelve error sobre ellos, `find` sale distinto de 0 y `set -eu` aborta; el segundo `find` (archivos) ni se ejecuta. `restorePhpWorkspaceAccess` lanza, y la ejecución PHP falla con error interno tras cada corrida de tests. El script debería limitarse a entradas propias (`-user sandbox`/`-uid 10001`) y excluir la raíz, o tolerar explícitamente lo no propio. Sin verificación en Docker real no está demostrado que funcione; hoy no existe prueba que lo cubra (el spec del runner solo comprueba el `Cmd` del container).

### B2 (alta) — `cleanup()`/`restoreHostAccess()` del host asume privilegios que el host no tiene
`cleanup` llama `restoreHostAccess`, que ejecuta `setfacl -m` sobre cada entrada, incluidas las propiedad de UID 10001 (todo lo que crean Composer/PHPUnit). Un proceso host no-root no es dueño de ellas, así que obtiene `EPERM`, `restoreHostAccess` lanza **antes** de `fs.rm`, y `cleanup` devuelve `false` sin intentar borrar. Consecuencias:
- el criterio 2 (host conserva cleanup tras ejecución ordinaria) no se cumple;
- en rutas que no llegan a la recuperación del contenedor (fallo/timeout de instalación, `oomKilled` en tests —se lanza antes de la línea 273—, excepciones previas) el workspace queda con máscara `r-x` heredada (Composer crea directorios 0755, la máscara de la default ACL sigue al modo) y el host no puede borrarlo; el sweeper TTL repite el mismo fallo indefinidamente (fuga de disco);
- la prueba real que "valida" esto corre `restoreHostAccess` como **root** con `getHostUid()` simulado en 1000, escenario que no existe en producción, y está skipped aquí.

Orden sugerido: intentar `fs.rm` primero y recurrir a recuperación (en contenedor, como 10001) solo si falla; o invocar la recuperación del contenedor en el `finally` de toda ejecución PHP y no depender de `setfacl` del host sobre entradas ajenas.

### B3 (alta) — Falta de evidencia ejecutada para los criterios 1–4
Toda la evidencia positiva son mocks de `runAclCommand` (comprueban argumentos, no comportamiento del kernel). Las dos pruebas reales están skipped y no se aportó reporte de una corrida Linux/Docker. Tampoco existe prueba de denegación para otro UID ni de aislamiento entre dos workspaces (plan, punto 4, y criterio 3). No marcar WI-SANDBOX-005 `[x]` sin esa evidencia; la tarea queda correctamente `[ ]`.

## Hallazgos no bloqueantes (a atender antes del cierre)

- M1 (media) — Imagen PHP obsoleta: `provisionImage` solo construye si la imagen no existe localmente. Una imagen `sandbox-php` ya construida (la de la VM/local) no contiene `restore-workspace-acl` ni `acl`; tras desplegar, todo PHP fallaría con comando no encontrado (127). Requiere versionar/etiquetar la imagen o forzar rebuild, y documentarlo.
- M2 (media) — Regresión de alcance: `createWorkspace` aplica ACL y falla cerrado para **todos** los perfiles, no solo PHP. Sin `setfacl` en la VM (confirmado en el análisis SDD), el servicio entero (Node incluido) deja de crear workspaces hasta instalar `acl`. Es coherente con "falla cerrada" pero debe declararse como prerrequisito de despliegue de todos los perfiles, o condicionarse al perfil PHP.
- M3 (media) — La recuperación en el pipeline, si falla, lanza antes de evaluar `testResult.timedOut`, enmascarando la clasificación `TEST_TIMEOUT` con un error genérico. Tratarla como degradación observable o evaluar el timeout primero.
- L1 (baja) — Inconsistencia documental de trazabilidad: `spec.md`/`tasks.md` dicen "sin HU / `storyIds: []`", mientras `CHANGELOG.md` y `harness/state.json` registran `HU11`. Consolidar en una sola decisión.
- L2 (baja) — Reformateo no relacionado en `artifact-materializer.spec.ts` y `workspace-manager.spec.ts` (ruido de diff).

## Criterios de aceptación del análisis SDD

| # | Criterio | Estado |
|---|----------|--------|
| 1 | UID 10001 lee/escribe | No demostrado (mocks; reales skipped); B1 podría impedirlo en la recuperación |
| 2 | Host conserva inspección y cleanup | No cumple en ejecución ordinaria con host no-root (B2) |
| 3 | Sin acceso a otros UID/workspaces; sin world-writable ni root | Diseño correcto (`o::---`, `g::---`, sin 0777, sin root); sin prueba de denegación (B3) |
| 4 | Pruebas con rutas anidadas, artefactos y chmod adversarial | Parcial: casos escritos, solo con mocks o skipped; el adversarial real corre como root |
| 5 | Falla cerrada si falta `setfacl` | Cumple (probado con mock de `ENOENT` y verificación `getfacl`); ver M2 |
| 6 | Sin cambios de contrato/VM/firewall/paquetes | Cumple |

## Resultado

`CHANGES_REQUESTED`. Corregir B1–B3 (y M1) y volver a revisar con una corrida real en Linux con `acl` y Docker (host no-root) que adjunte evidencia de lectura/escritura 10001, cleanup tras ejecución ordinaria y tras fallo, y denegación a otro UID. No aprobar commit/push de este corte hasta entonces.

---

## Re-revisión (delta posterior a CHANGES_REQUESTED)

Fecha: 2026-10-12  
Veredicto de la re-revisión: `APPROVED` para el corte de código, con condiciones no bloqueantes antes de marcar la tarea `[x]` y de publicar.  
Verificación: `pnpm -s lint` y `tsc --noEmit -p tsconfig.build.json` sin errores; `pnpm -s test` verde (las 2 pruebas con ACL real siguen skipped en macOS). Sin build, sin Docker, sin tocar :3001.

### Estado de hallazgos previos

| ID | Estado | Evidencia |
|----|--------|-----------|
| B1 | Resuelto | El script repara solo `-uid $(id -u)`, `-exec ... \;` no aborta y repara antes de descender; la evidencia Linux muestra `exit=0` con `CapDrop ALL`, sin red, sobre un árbol con `chmod 000/500/700` adversarial |
| B2 | Resuelto | `cleanup()` intenta `rm` primero y solo entonces `restoreHostAccess`, que toca únicamente entradas propias del host (o todo si es root real) |
| B3 | Parcial | Evidencia kernel real (volumen nombrado, host 1000, runner 10001, otro UID 20000), ver "Cobertura" |
| M1/M2/L1 | Resueltos | Consolidados en spec/CHANGELOG/tasks (rebuild de imagen, prerrequisito `acl` en Linux, HU11) |
| M3 | Resuelto | `recoverPhpWorkspaceAccess` es best-effort (solo `warn`), se ejecuta antes de evaluar `timedOut` y antes de `cleanup` en la ruta de fallo |

### Verificaciones especiales

1. **Sin escalada ni escritura a entradas ajenas.** El script solo modifica entradas con UID del runner (sin `CAP_FOWNER` el kernel impediría otras), usa `-P`, `-type d|f` (symlinks y especiales excluidos), UID numérico validado y ruta fija `/app`; no hay shell sobre entrada del usuario. Lo único que concede es `u:<hostUid>` sobre lo que el propio runner ya posee, y la máscara se acota (`m::r--` en archivos). `restoreHostAccess` solo hace `setfacl` sobre entradas del host (o como root real), valida que la ruta sea un directorio de ejecución gestionado y no sigue symlinks (`lstat`). Observación baja: `setfacl` sigue symlinks por defecto y hay una ventana TOCTOU entre `lstat` y `setfacl`; no es explotable porque el runner ya terminó y el proceso no-root no puede cambiar ACL ajenas. Opcional: pasar `-P`.
2. **`rm`-primero no oculta fallos.** Si ambos intentos fallan, `cleanup` registra `warn` y devuelve `false`, y el sweeper no marca el workspace como eliminado (se reintenta). Dos matices no bloqueantes: (a) el pipeline ignora el booleano de `cleanup`, por lo que el fallo queda solo en log, igual que antes; (b) en el camino de reintento el mensaje registrado es el del segundo intento y no el del `rm` original; conviene registrar ambos.
3. **Skip no-Linux.** `usesAcl()` es `process.platform === 'linux'`, `protected` y solo sobreescrito en specs: no puede activarse en la VM Linux, que sigue fail-closed (`WORKSPACE_PROVISIONING_FAILED`, INFRASTRUCTURE, sin rutas en el mensaje). Riesgo residual: el comportamiento en macOS/Docker Desktop (mapeo de propiedad) se asume y no está cubierto por la evidencia, que usa expresamente un volumen nombrado; solo afecta desarrollo local.
4. **Cobertura de criterios 1-4.**
   - Cubierto en kernel real: lectura/escritura del runner 10001 sobre árbol creado por él; acceso host 1000 tras recuperación; chmod adversarial reparado desde el contenedor sin capabilities; denegación a UID 20000; sin 0777 ni root; fail-closed (mock) y clasificación INFRASTRUCTURE.
   - No cubierto aún (condiciones): (i) `createWorkspace`/`restoreHostAccess`/`cleanup` de TypeScript contra un FS Linux real (las dos pruebas con `setfacl`+`setpriv` siguen skipped; hay que correrlas en Linux como root); la evidencia usa `setfacl` manual en vez del código; (ii) el `rm` real no se ejecutó (`No se ejecutó ningún borrado`); solo se comprobaron permisos `rwx` en directorios; (iii) el runner leyendo archivos del snapshot propiedad del host no se ejercita explícitamente (el check del paso 4 es del host); (iv) aislamiento entre dos workspaces del mismo UID 10001 depende solo de que cada contenedor monte su propio `/app`, no de ACL; es correcto pero no está probado como tal.

### Condiciones antes de cerrar

- Correr `workspace-manager.spec.ts` en Linux como root con `acl` y `setpriv` (las 2 pruebas skipped deben pasar) y adjuntar la salida.
- Tras desplegar, reconstruir la imagen `sandbox-php` y hacer un smoke con un proyecto PHP real (cubre iii y el `rm` real); sin esto, mantener WI-SANDBOX-005 `[ ]`.
- Antes de commit: confirmar que `Refs: HU11` y `storyIds` son coherentes en `harness/state.json`.
