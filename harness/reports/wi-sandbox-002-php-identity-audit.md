# WI-SANDBOX-002 — Auditoría inicial de identidad PHP

**Historias:** HU43  
**Estado:** `SELECTED`; no se implementó código ni se modificaron contratos.

## Desviación de secuencia

Después de registrar este WI, se inició una corrección local antes de completar y registrar la verificación SDD/`decisionGate`: siete archivos quedaron modificados, cuatro bajo `app/`. El diff se conserva para revisión; no constituye una implementación aprobada ni evidencia de cierre. Se suspenden cambios y E2E adicionales hasta que el análisis SDD evalúe el alcance y las decisiones aplicables y deje el resultado trazable en `harness/state.json`.

## Resultado de gates A–E

- **A — identidad Unix no-root:** pendiente. `SANDBOX_PHP_CONTAINER_USER` conserva `root` como default.
- **B — bootstrap Composer por named volume:** resuelto por sustitución. PHP usa la imagen gestionada `tjc-sandbox-php:8.3`, que contiene Composer y `unzip`; no hay bootstrap Composer ni `chown` por ejecución.
- **C — workspace pnpm:** pendiente de evaluar/corregir: el `pnpm-workspace.yaml` actual no declara `packages: ['.']`.
- **D — root solo como override explícito:** pendiente; el default actual es `root`.
- **E — evidencia Docker Linux:** Docker Desktop 28.3.2 está disponible. Se lanzó `pnpm --dir app run test:e2e`; el proceso terminó, pero esta auditoría no conservó su salida/exit code, por lo que no la acredita como evidencia verde. Las pruebas E2E existentes cubren Composer/PHPUnit y entorno Laravel; el corte debe dejar tres casos reproducibles y su salida verificable.

## Límites

No se cambian SDD 2.1, SYSTEM-2.2 ni INTEROP-2.8. `DEC-INF-001` solo bloquea provisión remota: esta auditoría y Docker local no la resuelven ni declaran GCE. No se agrega persistencia de dominio, ni se hace push, despliegue o cambio de infraestructura externa.
