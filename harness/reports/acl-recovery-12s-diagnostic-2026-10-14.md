# Diagnóstico — ~12 s de `restore-workspace-acl` por ejecución PHP

Fecha: 2026-10-14. Solo diagnóstico y propuesta; **no se implementó ni se tocó la VM**. Requiere aprobación de alcance de Jean.

## Veredicto: CONFIRMADO

El hallazgo de Core/Cross es correcto y la causa es una regresión de **WI-SANDBOX-005** (la recuperación ACL en contenedor la introdujo este WI; antes no existía ese costo).

**Mecanismo (verificado en código).** Tras `RUNNING_TESTS`, `recoverPhpWorkspaceAccess` (`execution-pipeline.service.ts`) lanza un contenedor `acl-recovery` que corre `restore-workspace-acl`, el cual ejecuta `find … -type f -exec setfacl … {} \;`: **un proceso `setfacl` por archivo**. Con ~7 300 archivos (ventas con `vendor/`) son ~7 300 `fork+exec`. El tiempo cae entre `RUNNING_TESTS.completedAt` y `completedAt` de la ejecución porque la recuperación no es una etapa de `stageDurations` (hecho ya señalado en el diagnóstico de la Fase 2).

## Evidencia propia (reproducida de forma independiente)

Contenedor Linux local (imagen del `Dockerfile` PHP con `acl`, runner UID 10001, `--cap-drop ALL`, red `none`, volumen nombrado); 7 000 archivos en 700 directorios, con un archivo `chmod 000` y un directorio `chmod 000`.

| Pasada de archivos | Tiempo |
|---|---|
| `-exec setfacl … {} \;` (actual) | **9 607 ms** |
| `-exec setfacl … {} +` (propuesta) | **76 ms** |

- ACL resultantes **idénticas**: `getfacl -R -cp . | sort | md5sum` coincide entre ambas variantes (incluye los casos `chmod 000`).
- Coherente con la medición de Cross (12 515 → 1 588 ms en ventas; el resto de ese tiempo es la pasada de directorios y el arranque del contenedor).

## Semántica de errores con `+` (matiz de `set -eu`)

Comprobado empíricamente: con `{} +`, si `setfacl` falla en un archivo (p. ej. uno de otro dueño):
- `setfacl` imprime el error y **sigue con el resto del lote**; los demás archivos reciben su ACL (verificado: `user:1000:r--` presente en un archivo vecino).
- `find` **sale con código 1 al final**, y por `set -eu` el script termina con 1.
- Con `\;` hoy, el exit de `find` es 0 aunque un `setfacl` falle: los fallos son **silenciosos**.

Consecuencia: con `+` un fallo aislado pasa a ser **visible** (`workspace ACL recovery failed: exitCode=1 …` en un `WARN`), pero no cambia el resultado de la ejecución: `recoverPhpWorkspaceAccess` es best effort, solo registra y no enmascara `TEST_TIMEOUT` ni `COMPLETED`. El filtro `-uid $(id -u)` ya excluye entradas ajenas, así que el fallo real esperado es raro (carrera/archivo desaparecido). No se recomienda silenciarlo con `|| true`: la visibilidad es una mejora.

## Cambio mínimo propuesto

En `app/docker/php/restore-workspace-acl`, **solo la pasada de archivos** pasa de `{} \;` a `{} +`. La pasada de **directorios se queda con `\;`**: es la que repara un directorio `chmod 000` *antes* de descender (con `+` find intentaría leerlo sin permiso). Comentario del script actualizado. Sin cambios en el código Node, contrato, aislamiento, UID ni capabilities.

## Prueba rojo → verde

1. **Estática (corre en macOS y CI, sin Docker):** `app/src/container/restore-workspace-acl.spec.ts` lee el script y afirma que la pasada de archivos usa `-exec … {} +` y la de directorios `\;`. **Rojo** hoy; verde tras el cambio.
2. **Conductual con Docker (`skipIf` sin Docker/imagen, como `container-runner.integration.spec.ts`):** monta un árbol temporal de ~500 archivos como `/app`, antepone al `PATH` del contenedor un `setfacl` contador (shim que registra cada invocación y delega al real) y ejecuta el script como UID 10001. Afirma: nº de invocaciones de `setfacl` sobre archivos ≤ ~10 (frente a ~500 con `\;`), ACL de un archivo `chmod 000` y de un directorio `chmod 000` correctas y exit 0. El conteo de invocaciones es determinista (no mide tiempo, evita flaky).

## Procedimiento de despliegue (requiere 2FA de Jean en la VM; el código Node no cambia)

No hace falta reiniciar el proceso del Sandbox ni `pnpm build`: la recuperación corre en un contenedor efímero que usa la imagen por etiqueta. Reconstruir la imagen es suficiente (el servicio solo construye si no existe, por eso se hace a mano).

```bash
cd ~/tjc-be-test-execution-sandbox && test -z "$(git status --porcelain)" && git pull --ff-only && git log -1 --format=%H
docker tag tjc-sandbox-php:8.3-nonroot tjc-sandbox-php:8.3-nonroot-prev       # respaldo para revertir
docker build -q -t tjc-sandbox-php:8.3-nonroot ~/tjc-be-test-execution-sandbox/app/docker/php
docker run --rm --entrypoint sh tjc-sandbox-php:8.3-nonroot -c 'grep -c "{} +" /usr/local/bin/restore-workspace-acl'   # debe imprimir 1
```

Hacerlo entre ejecuciones (una recuperación en curso usa la imagen anterior sin problema; la etiqueta cambia al terminar el build). **Reversión:** `docker tag tjc-sandbox-php:8.3-nonroot-prev tjc-sandbox-php:8.3-nonroot`. Verificación posterior: una ejecución PHP real debe dejar el hueco entre `RUNNING_TESTS.completedAt` y `completedAt` de la ejecución muy por debajo de los ~12 s.

## Riesgos y relación con paper/tesis

- Riesgo: bajo; mismo conjunto de ACL (comprobado) y mismo aislamiento.
- **Medición:** `executionDurationMs` bajará ~10 s por este arreglo. Si la tesis compara tiempos antes/después, debe anotarse en la evidencia que el cambio de duración proviene de este fix (fecha y SHA), no de un cambio de estrategia.
- No roza: el Sandbox sigue sin tokens de GitHub ni Functional Knowledge; ejecución aislada intacta.

## Frase de aprobación de alcance

«Autorizo cambiar solo la pasada de archivos de restore-workspace-acl a `-exec … {} +`, con la prueba estática y la conductual con Docker, commit local con Refs: HU11, y el despliegue reconstruyendo la imagen tjc-sandbox-php:8.3-nonroot en la VM con mi 2FA, sin reiniciar el Sandbox.»
