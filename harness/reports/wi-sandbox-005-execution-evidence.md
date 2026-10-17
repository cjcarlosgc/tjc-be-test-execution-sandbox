# WI-SANDBOX-005 — Evidencia de ejecución (Linux local + VM)

Fecha: 2026-10-12. Sin secretos. Sin cambios en la VM por parte de este WI.

## 1. `workspace-manager.spec.ts` en Linux como root con `acl` (ejecutado por el Sandbox)

Contenedor `node:22-slim` local (Docker Desktop, kernel Linux), usuario root (`id -u` = 0), `acl` + `setpriv` instalados, repo montado solo lectura y `app/` copiado a un directorio de trabajo con `pnpm install --frozen-lockfile`. Las 2 pruebas con ACL real **dejan de estar skipped**:

- `grants UID 10001 access and preserves host access to runner-created descendants` ✓
- `restores host access after untrusted chmod without following symlinks` ✓
- Archivo completo: **19 passed / 0 failed / 0 skipped**.

Hallazgo corregido al ejecutarlas por primera vez: las dos fallaban con `EACCES` porque el directorio raíz temporal de la prueba (0700, root) no era atravesable por UID 10001; en producción Docker expone solo el mount del workspace. Se corrigió la preparación de la prueba (`u:10001:--x` en la raíz); no hubo cambio en código de producto.

## 2. Evidencia real en la VM (reportada por la sesión Cross; el Sandbox no la verificó de forma independiente)

Sandbox desplegado en `9e2d1b0`, acceso solo por IAP:

- Core→Sandbox remoto `d1ed72b9-b1f2-4477-b220-05dff0078647`: `COMPLETED`, 3/3 PHPUnit, `getmyuid()===10001`, cwd distinto de la ruta del host, etapas 747/3441/668 ms.
- E2E de producto (PR en `rag-tesis-org/tjc-piloto-ventas`, perfil `PHP_LARAVEL_PHPUNIT`): ejecuciones `438d3a7d-…`, `7692fb0b-…`, `61d3e1d1-…`, `09ca24d7-…` (4/4 SUCCESS) y `9df56f3b-31a3-495f-9ee1-c52441f96528` (SUCCESS).
- Smoke local macOS fallido `c24cc736-5ef0-4bc3-b1b2-93da364cfe32` (ACL en macOS): corregido por este WI y reflejado en el fallo remoto previo ya clasificado.

Cubre «rm real + runner leyendo el snapshot» del criterio pendiente de la revisión.

## Criterios del análisis SDD

| # | Criterio | Evidencia |
|---|----------|-----------|
| 1 | UID 10001 lee/escribe | Pruebas reales Linux + ejecuciones VM |
| 2 | Host conserva inspección y cleanup | Pruebas reales Linux + ejecuciones VM |
| 3 | Sin acceso a otros UID/workspaces; sin 0777/root | Docker kernel (`wi-sandbox-005-linux-acl-evidence.md`) |
| 4 | Rutas anidadas, artefactos, chmod adversarial | Pruebas reales Linux |
| 5 | Falla cerrada sin `setfacl` | Prueba unitaria + clasificación INFRASTRUCTURE |
| 6 | Sin cambios de contrato/VM/firewall | Verificado |

## Límites

No se verificó de forma independiente el contenido de las ejecuciones de la VM ni el estado final de cleanup en ella más allá de lo reportado.
