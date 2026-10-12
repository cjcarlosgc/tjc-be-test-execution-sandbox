# WI-SANDBOX-005 — Evidencia Linux real de la ACL (Docker, kernel Linux)

Fecha: 2026-10-12. Responde a B1/B2/B3 de `wi-sandbox-005-review.md`.

## Método

Imagen temporal construida desde `app/docker/php/Dockerfile` (incluye `acl` y `restore-workspace-acl`) y un **volumen Docker nombrado** (no bind mount: Docker Desktop mapea propiedad en bind mounts de macOS y no sirve como evidencia). Host simulado = UID 1000 sin capabilities; runner = UID 10001 con `--cap-drop ALL`; recuperación con `--network none`. No se ejecutó ningún borrado.

## Resultados

| Paso | Resultado |
|------|-----------|
| Aprovisionamiento ACL (equivalente a `createWorkspace`) | OK |
| Host UID 1000 materializa snapshot | OK |
| Runner UID 10001 crea `vendor/`, `storage/` y luego `chmod 000/500/700` adversarial | OK |
| Host UID 1000 **antes** de recuperar | `DENIED` en `vendor/pkg`, `vendor/pkg/deep`, `storage`, `storage/logs` y archivos del runner; `OK` en entradas propias del host |
| `restore-workspace-acl 1000 /app` como UID 10001, sin caps ni red | `exit=0` (B1 resuelto: solo toca entradas propias, `-exec \;` no aborta) |
| Host UID 1000 **después** de recuperar | `OK` (r/w/x en todos los directorios; lectura en todos los archivos) → puede inspeccionar evidencia y es condición suficiente para el `rm` posterior (B2) |
| UID 20000 (otro usuario/ejecución) | `Permission denied` al listar y al escribir (criterio 3) |

## Cambios derivados de la revisión

- B1: el script repara solo `-uid $(id -u)`; ya no intenta `setfacl` sobre la raíz ni sobre entradas del host.
- B2: `cleanup()` intenta `rm` primero; `restoreHostAccess()` solo toca entradas que el host posee (o todo si es root real).
- M3: la recuperación del pipeline es best-effort y no enmascara `TEST_TIMEOUT`; también se ejecuta en rutas de fallo antes de `cleanup`.
- M2: documentado en spec que `acl` es prerrequisito de todos los perfiles en Linux.
- M1: documentado en spec y runbook: reconstruir la imagen al desplegar.

## Límites

La evidencia valida la semántica del kernel y del script; no es una corrida E2E del servicio en la VM. Las pruebas unitarias reales con `setfacl` siguen `skipped` en macOS y deben correr en Linux.
