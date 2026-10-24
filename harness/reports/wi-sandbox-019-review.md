Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revisión independiente — WI-SANDBOX-019

Veredicto: **APPROVED** (sin BLOCKER ni MAJOR; 2 MINOR informativos). Reportes de la sesión revisados, resultados contrastados.

## Hallazgos
1. Causa confirmada con Docker Linux (volumen con dueño 1001): directorio 0700 + `--user 10001` + `PATH=/shim:…` → el shim se salta (también vía `find -exec`); con 0755 corre. Con la imagen real (`app/docker/php`) y el script `restore-workspace-acl`: 0700 → `EXIT=0` y `/tmp/setfacl.log` inexistente (`FILE_CALLS=` vacío = el NaN de la CI); 0755 → `FILE_CALLS=1`.
2. Otras causas descartadas: `/tmp` del contenedor es 1777 (log escribible por 10001 con `--cap-drop ALL`); la imagen instala `acl` (Dockerfile:17) y `/usr/bin/setfacl` existe; `:ro` no impide ejecutar; `noexec` en `/tmp` del runner de GitHub no aplica (no está montado noexec).
3. La mutación de control (quitar `chmod`) pasa en macOS (Docker Desktop ignora permisos del host): esperado, no es fallo. La prueba del fallo es el experimento Linux del punto 1, no el test en macOS.
4. Solo cambia el spec en `app/src` (`git show HEAD --stat -- app/src`).

## MINOR
- `app/src/container/restore-workspace-acl.spec.ts:~86`: `writeFile(..., {mode: 0o755})` está sujeto al umask; con umask 077 el archivo quedaría 0700 y volvería el síntoma (la nueva aserción lo señalaría con mensaje claro). Opcional: `fs.chmod` del archivo. Improbable en la CI.
- Límite: no se pudo ejecutar el spec dentro de un contenedor Linux con el socket montado de forma fiel (los bind mounts de Docker Desktop vienen de macOS y no respetan permisos); la confirmación definitiva la da la CI del PR.

## Suficiencia
`chmod 0755` del directorio + aserción explícita es suficiente en Linux para la causa identificada; la aserción convierte cualquier recurrencia en un mensaje diagnóstico en vez de `NaN`.

## Comandos y resultados (app/ y raíz)
- `pnpm exec vitest run src/container/restore-workspace-acl.spec.ts`: 2 pass
- `pnpm lint`: ok · `pnpm test`: 37 archivos, 321 pass, 3 skipped · `pnpm build`: ok · `pnpm contracts:check`: ok
- `node scripts/sdd-check.mjs` OK · `validate-work-items` OK (11 WI) · `validate-harness` OK · `validate-completions` OK (10 WI) · `node --test harness/*.test.mjs`: 31 pass, 0 fail
- Experimentos Docker: volúmenes/imágenes/contenedores de prueba eliminados; `git status` limpio salvo este reporte.
