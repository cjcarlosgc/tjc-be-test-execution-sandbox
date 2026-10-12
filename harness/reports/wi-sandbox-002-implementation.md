# WI-SANDBOX-002 — evidencia de implementación

Fecha: 2026-10-12
Historia: HU43
Alcance aprobado: identidad PHP no-root local, caché Composer inicializada automáticamente y workspace pnpm raíz.

## Resultado

- La imagen gestionada PHP crea `sandbox` con UID/GID 10001.
- Las operaciones normales de Composer y PHPUnit usan `sandbox`.
- El volumen `sandbox-composer-cache` se prepara una vez por instancia del runner con `chown -R sandbox /composer-cache`, ejecutado como root, sin red y con solo `CHOWN`; no monta el workspace. El recorrido recursivo también corrige entradas heredadas de ejecuciones antiguas como root.
- `app/pnpm-workspace.yaml` declara `packages: ['.']`.
- No se modificaron contratos, VM/GCE, despliegue ni provisión remota.

## Comandos reproducibles y resultado

```text
pnpm --dir app test
25 archivos, 194 pruebas: PASSED

pnpm --dir app run build
PASSED

pnpm --dir app run lint
PASSED

node harness/validate-harness.mjs
Harness validation passed.

pnpm --dir app run test:e2e
3 archivos, 21 pruebas: PASSED (59.80 s)
```

La prueba E2E PHP ejecuta un PHPUnit generado que afirma `id -u = 10001`; Docker Desktop construyó y usó `tjc-sandbox-php:8.3-nonroot` durante la evidencia.

## Siguiente gate

La revisión independiente inicial pidió dos correcciones, ambas aplicadas: el ownership del caché pasó a ser recursivo para reparar entradas heredadas de root y `SANDBOX_PHP_CONTAINER_USER` dejó de permitir una vuelta a root. El segundo ciclo detectó el tag antiguo en `.env.example`; se alineó con `tjc-sandbox-php:8.3-nonroot`, que la imagen gestionada construye, y se documentó que una imagen externa debe aportar `composer`, `unzip` y `sandbox` con UID/GID 10001. Los checks técnicos posteriores están en verde. La confirmación excepcional posterior señaló esta precisión documental y quedó corregida; no se solicitarán más ciclos IA. No se hizo commit ni push.
