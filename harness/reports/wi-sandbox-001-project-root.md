# WI-SANDBOX-001 — projectRoot Core→Sandbox

**Historias:** HU43  
**Fecha:** 2026-10-11  
**Estado:** APPROVED

## Alcance verificado

- `projectRoot` opcional se persiste como `.` cuando se omite y participa normalizado en la huella de idempotencia.
- Para PHP se valida como ruta POSIX normalizada, existente bajo `repositoryRoot`, sin traversal, absoluta ni escape por symlink; Composer y PHPUnit reciben el cwd `/app/<projectRoot>`.
- Los artefactos se materializan desde su ruta repo-relative y rechazan traversal por symlink.
- Node conserva únicamente `projectRoot = .`; no existe detección o selección de raíz en Sandbox.

## Verificaciones

- `pnpm --dir app test` — 192 pruebas en verde.
- `pnpm --dir app run lint` — verde.
- `pnpm --dir app run build` — verde.
- `pnpm --dir app run test:e2e` — ejecutado con Docker Engine 28.3.2 disponible.
- `git diff --check` — verde.
- `node harness/validate-harness.mjs` — verde al cierre.

## Revisión independiente

- Revisión técnica: APPROVED tras corregir el rechazo de `null`, el escape de artefactos por symlink y añadir la evidencia del cwd PHP.
- Revisión contractual: APPROVED tras confirmar la misma corrección y que el alcance vinculante no permite detección de raíces Node en Sandbox.

`CS-CORE-20261011-002` sigue **ACKNOWLEDGED**; este corte no modifica el contrato canónico de Core.
