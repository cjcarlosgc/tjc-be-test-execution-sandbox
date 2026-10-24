Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Runbook de despliegue en la VM — WI-SANDBOX-021 (imagen PHP ampliada)

**No ejecutado.** Lo ordena el usuario aparte (con su 2FA en la VM). La imagen gestionada `tjc-sandbox-php:8.3-nonroot` **no se reconstruye sola** si cambia el Dockerfile: `ContainerRunner` solo la construye cuando falta el tag. Como en la VM ya existe, hay que reconstruirla a mano con el mismo tag. `SANDBOX_DEFAULT_PHP_IMAGE` no cambia mientras se use el tag gestionado.

Digest de referencia de la imagen construida y verificada en local (Docker Desktop, php:8.3-cli base): `sha256:e41aa91aca5d4eb00e8228c4ebbc16d516fcb7ba8fe94a9038bbbe203694fbc7`. Puede diferir en la VM si la base `php:8.3-cli` se actualizó; lo que importa es la verificación de abajo.

1. Árbol limpio y actualizar el código (trae `Dockerfile`, `zz-sandbox.ini` y el cambio de contexto del build): `cd ~/tjc-be-test-execution-sandbox && test -z "$(git status --porcelain)" && git pull --ff-only && git log -1 --format=%H`
2. Respaldo de la imagen actual: `docker tag tjc-sandbox-php:8.3-nonroot tjc-sandbox-php:8.3-nonroot-prev`
3. Reconstruir (contexto = `app/docker/php`): `docker build -q -t tjc-sandbox-php:8.3-nonroot ~/tjc-be-test-execution-sandbox/app/docker/php` (compila extensiones: puede tardar varios minutos; hacerlo entre ejecuciones).
4. Verificar extensiones: `docker run --rm --entrypoint php tjc-sandbox-php:8.3-nonroot -m | grep -E '^(intl|gd|zip|bcmath|gmp)$'` → deben salir las cinco.
5. Verificar límite de memoria y usuario: `docker run --rm --user 10001:10001 --entrypoint php tjc-sandbox-php:8.3-nonroot -r 'echo ini_get("memory_limit"), " ", INTL_ICU_VERSION, PHP_EOL;'` → `512M` y la versión de ICU; `docker run --rm --entrypoint sh tjc-sandbox-php:8.3-nonroot -c 'id sandbox; for c in composer setfacl unzip; do command -v $c || echo MISSING $c; done'`.
6. Registrar el digest: `docker image inspect --format '{{.Id}}' tjc-sandbox-php:8.3-nonroot` (la imagen se **congela** antes del experimento; anotar el digest en el protocolo).
7. Smoke: una ejecución PHP real; confirmar que termina y que el hueco `RUNNING_TESTS.completedAt` → `completedAt` sigue muy por debajo de ~12 s.
8. Reinicio del Sandbox: no es necesario por la imagen (se resuelve por tag en cada ejecución). El cambio de código del contexto de build (`zz-sandbox.ini`) solo importa si un host construye la imagen desde cero; se aplica en el siguiente reinicio normal.

**Reversión:** `docker tag tjc-sandbox-php:8.3-nonroot-prev tjc-sandbox-php:8.3-nonroot`.

**Variables de entorno de la VM:** sin cambios por este WI. Recordatorio de WI-010: `SANDBOX_EXECUTION_STATE_DIR` absoluto, persistente y escribible; `SANDBOX_MAX_CONCURRENT_EXECUTIONS=2` por defecto.
