# Auditoría de autorización para despliegue/E2E remoto — 2026-10-12

## Alcance de la autorización comunicada

Jean autorizó actualizar el checkout de `rag-test-execution-sandbox` a
`origin/feature/jean` y desplegar el Sandbox para un E2E. Esta auditoría no
ejecuta ninguna acción remota y no cambia contratos, firewall, VM ni despliegue.

La autorización debe materializarse en un work item operativo separado de
`WI-SANDBOX-003`, bajo HU47, con evidencia de checkout, arranque, health y E2E.
No convierte por sí sola `DEC-INF-001` en una resolución canónica de
SYSTEM-2.2.

## Procedimiento versionado disponible

No existe un procedimiento remoto reproducible en este repositorio: no hay
Docker Compose, unidad systemd, script de despliegue ni configuración de proceso
versionada. `pnpm run deploy` delega a `nest deploy`, pero no constituye por sí
mismo una receta de VM ni documenta servicio, directorio, usuario o reinicio.
La guía de levantamiento conjunto se remite a otro repositorio (`app/README.md`).

Antes de ejecutar la autorización, el operador remoto debe inspeccionar de forma
controlada el mecanismo ya usado por la VM y registrarlo en el nuevo work item;
no debe inferirse ni inventarse desde este checkout.

## Preflight mínimo del nuevo work item

1. Confirmar acceso IAP/OS Login autorizado y conservar la evidencia de la VM.
2. Actualizar el checkout únicamente al SHA autorizado y registrar el SHA final.
   A la fecha de esta auditoría, `origin/feature/jean` es
   `1139abc131a9037d74f68c83d02ee94fd964feeb`; los cambios locales de
   WI-SANDBOX-002 permanecen sin commit, por lo que no forman parte de ese SHA.
3. Identificar y documentar el mecanismo de proceso remoto antes de arrancarlo.
4. Verificar `GET /health/live` y `GET /health/ready` a través del acceso IAP
   autorizado, y solo después ejecutar el E2E autorizado.
5. Registrar el SHA efectivo del proceso/contenedor si el mecanismo lo expone;
   no confundir el SHA del checkout con un servicio efectivamente arrancado.

## Configuración: nombres requeridos y estado conocido

No se inspeccionaron ni registraron valores de la VM.

- Requeridos por el arranque/operación real: `SANDBOX_SERVICE_TOKEN` y
  `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`.
- Requerido para el endpoint aprobado por el firewall: `PORT=3001` (el proceso
  usa 3000 si no se define).
- Requerido por las ejecuciones Docker: un daemon Docker accesible por el socket
  por defecto o por `SANDBOX_DOCKER_SOCKET_PATH`; alternativamente
  `SANDBOX_DOCKER_HOST` y `SANDBOX_DOCKER_PORT`.
- Deben revisarse según el escenario remoto, sin exponer sus valores:
  `SANDBOX_WORKSPACE_ROOT`, `SANDBOX_DEFAULT_NODE_IMAGE`,
  `SANDBOX_DEFAULT_PHP_IMAGE`, límites `SANDBOX_CONTAINER_*`, y timeouts de
  instalación/prueba.

La presencia o ausencia efectiva de todas esas variables en la VM es
**desconocida** hasta una comprobación remota autorizada. No se afirma que
ninguna esté configurada ni ausente.

## Gates restantes

El preflight de `WI-SANDBOX-003` sigue siendo válido: no hay servicio remoto
verificado en 3001 y no hay SHA de servicio. El futuro work item debe conservar
la separación entre la autorización operativa comunicada y el estado canónico
`DEC-INF-001: PENDING` hasta que Core publique una actualización canónica.
