# Runbook de despliegue en la VM — WI-SANDBOX-008 (solo imagen; sin reiniciar el Sandbox)

Autorizado por Jean para ejecutarse con su 2FA. **El código Node no cambia**: no hay `pnpm build` ni reinicio. La recuperación corre en un contenedor efímero que resuelve la imagen por etiqueta; basta reconstruirla. El servicio solo construye la imagen si no existe, por eso se hace a mano. Sin secretos.

1. Árbol limpio y actualizar: `cd ~/tjc-be-test-execution-sandbox && test -z "$(git status --porcelain)" && git pull --ff-only && git log -1 --format=%H`
2. Respaldo de la imagen actual: `docker tag tjc-sandbox-php:8.3-nonroot tjc-sandbox-php:8.3-nonroot-prev`
3. Reconstruir (contexto = `app/docker/php`): `docker build -q -t tjc-sandbox-php:8.3-nonroot ~/tjc-be-test-execution-sandbox/app/docker/php`
4. Verificar el script dentro de la imagen: `docker run --rm --entrypoint sh tjc-sandbox-php:8.3-nonroot -c 'grep -c "{} +" /usr/local/bin/restore-workspace-acl'` → debe imprimir `1`.
5. Verificar que `acl` sigue presente: `docker run --rm --entrypoint sh tjc-sandbox-php:8.3-nonroot -c 'command -v setfacl'`
6. Smoke: una ejecución PHP real; el hueco entre `RUNNING_TESTS.completedAt` y el `completedAt` de la ejecución debe quedar muy por debajo de ~12 s.

Hacerlo entre ejecuciones (una recuperación en curso usa la imagen anterior; la etiqueta cambia al terminar el build).

**Reversión:** `docker tag tjc-sandbox-php:8.3-nonroot-prev tjc-sandbox-php:8.3-nonroot` (inmediata; no requiere reiniciar nada).
