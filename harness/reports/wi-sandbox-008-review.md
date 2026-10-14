# Revisión independiente — WI-SANDBOX-008 (pasada de archivos de restore-workspace-acl con `{} +`)

Fecha: 2026-10-14  
Veredicto: `APPROVED` (sin bloqueantes).  
Reviewer: `reviewer`; revisión estática del working tree; sin build, sin tocar :3001 ni la VM.

## Verificaciones ejecutadas

- `pnpm -s lint` y `tsc --noEmit -p tsconfig.build.json`: sin errores. `sh -n` del script: sintaxis correcta.
- `vitest run src/container/restore-workspace-acl.spec.ts -t "estático"`: 1 passed (la prueba conductual con Docker no se ejecutó en esta revisión, a propósito, para no tocar el daemon local; se revisó por lectura).
- Diff de código: solo `app/docker/php/restore-workspace-acl` (1 línea efectiva + comentario) y el spec nuevo.

## Criterios

1. **Semántica ACL idéntica: cumple.** Cambia únicamente el terminador de la segunda pasada (`\;` → `+`). Las especificaciones (`u::rw-,u:<host>:r--,g::---,m::r--,o::---`), el filtro `-uid "$owner_uid"`, `-type f`, `-P`, `-xdev` y la validación de UID/`/app` no cambian. El diagnóstico aporta además equivalencia empírica (`getfacl -R` con md5 idéntico, incluidos casos `chmod 000`).
2. **Errores con `+` y `set -eu`: coherente.** Un `setfacl` que falla no detiene el lote; `find` sale con 1 al final y el script termina con 1. Eso es una mejora de visibilidad (antes `\;` devolvía 0 aunque fallara un archivo) y es el último comando del script, por lo que no omite trabajo posterior. `recoverPhpWorkspaceAccess` es best effort: solo hace `warn` y no enmascara `TEST_TIMEOUT` ni el resultado. Observación menor, preexistente: el `set -e` aborta antes de la pasada de archivos si el `find` de directorios falla por sí mismo; no cambia con este WI.
3. **Pasada de directorios conserva `\;`: cumple.** Se repara cada directorio antes de que `find` descienda (caso `chmod 000`); la pasada de archivos va después, con los directorios ya legibles. La prueba estática lo fija para ambas pasadas y la conductual incluye un directorio `d7` y un archivo `d3/f1` en `000`.
4. **Pruebas deterministas y limpias: cumple.** La conductual cuenta invocaciones de `setfacl` (500 archivos, `≤ 10` lotes, `> 0`), no mide tiempo. Se salta con `skipIf` si no hay Docker y con `ctx.skip()` si el build falla por red. `afterAll` elimina volumen (nombre con PID), imagen etiquetada propia y directorio shim. El shim va en un bind `:ro` y solo antepone `PATH` en el contenedor de prueba, ejecutado como UID 10001 con `--cap-drop ALL --network none`; no introduce privilegios nuevos ni afecta la imagen real. Nota menor: `docker rmi -f` sobre la etiqueta dedicada `tjc-sandbox-php-acl-spec:local`; no toca `tjc-sandbox-php:8.3-nonroot`.
5. **Sin impacto en contrato/UID/red/capabilities: cumple.** No se tocan TypeScript de producción, contratos, Dockerfile, identidad 10001, red ni capabilities; el cambio llega con la reconstrucción manual de la imagen (el servicio no la reconstruye si existe).

## Observaciones no bloqueantes

- Tras reconstruir en la VM, verificar con el `grep -c "{} +"` del runbook y con una ejecución PHP real que el hueco posterior a `RUNNING_TESTS` baje de ~12 s.
- La duración de ejecución cambiará por este fix (no por estrategia): anotarlo si se usa en evidencia de tesis.
- Registrar la prueba conductual con Docker en la evidencia del WI cuando se ejecute en un entorno con daemon dedicado.

## Resultado

`APPROVED`. Commit con `Refs: HU11`, sujeto a autorización explícita del usuario.
