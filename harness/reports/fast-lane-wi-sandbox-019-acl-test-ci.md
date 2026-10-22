Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Vía rápida — WI-SANDBOX-019 (test ACL que falla en la CI)

Pedido de cross (PR #7 con «Lint, build y tests de app/» en rojo); alcance y push aprobados por el usuario en el chat del Sandbox el 2026-10-22.

## Síntoma (log de la CI de GitHub, ejecución del push)
`src/container/restore-workspace-acl.spec.ts` (conductual, Docker real, de WI-SANDBOX-008): `expected NaN to be greater than 0` en la línea 116. `EXIT=0` se cumple, pero `FILE_CALLS` sale vacío: `/tmp/setfacl.log` no existe, o sea el shim `setfacl` nunca se ejecutó. El resto de la suite pasa (319 + este fallo).

## Causa (verificada el mecanismo; el fallo concreto en GitHub se confirma con la CI)
El shim se monta desde `fs.mkdtemp` (modo **0700**, dueño el usuario del runner) y el contenedor corre como UID **10001**, que no puede entrar en `/shim`; con `PATH=/shim:…` el shell salta el directorio ilegible y usa el `setfacl` real: sale con 0 y sin log. Demostración en Docker/Linux con un volumen: shim en directorio 0700 de otro UID → el shim se ignora (`id -u` devuelve 10001 sin `SHIM_RAN`); con 0755 → `SHIM_RAN`. En Docker Desktop (macOS) el test pasaba porque el montaje ignora los permisos del host; por eso no se vio en local.

## Arreglo (solo el test)
`restore-workspace-acl.spec.ts`: `fs.chmod(shimDir, 0o755)` tras el `mkdtemp`, y una aserción explícita con mensaje claro si el shim no se ejecutó (en lugar de `NaN`). Sin cambio de producto.

## Verificación local (con Docker Desktop)
Test conductual: 2 pasan. `pnpm test`: 321 pasan, 3 omitidos; lint en verde. La confirmación en Linux la da la CI del PR (ver el reporte de cierre).

## Declaración
Cambio mínimo hecho por el leader (5 líneas en 1 archivo de pruebas, sin lógica de producto). Revisión independiente: `reviewer`.
