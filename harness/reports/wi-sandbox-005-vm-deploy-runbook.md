# Runbook de despliegue en la VM — WI-SANDBOX-005 (HU11)

Un comando por paso; las rutas son absolutas respecto del clon en `~/tjc-be-test-execution-sandbox` y no dependen del cwd. No imprime secretos: el entorno del proceso nunca se muestra. Requiere que los commits estén en `origin/feature/jean` (push explícito del usuario).

Commit de código: `0c2b43a` · HEAD documental esperado: el publicado por el usuario.

1. Árbol limpio: `cd ~/tjc-be-test-execution-sandbox && test -z "$(git status --porcelain)" && echo clean`
2. Actualizar: `git fetch origin && git checkout feature/jean && git pull --ff-only && git log -1 --format=%H`
3. Prerrequisito host: `command -v setfacl getfacl`
4. Dependencias con lockfile: `cd ~/tjc-be-test-execution-sandbox/app && pnpm install --frozen-lockfile`
5. Reconstruir imagen PHP (solo se construye si no existe; el contexto es `app/docker/php`, ruta absoluta desde cualquier cwd): `docker build -q -t tjc-sandbox-php:8.3-nonroot ~/tjc-be-test-execution-sandbox/app/docker/php`
6. Verificar imagen: `docker run --rm --entrypoint sh tjc-sandbox-php:8.3-nonroot -c 'command -v restore-workspace-acl setfacl'`
7. Capturar entorno del proceso actual sin mostrarlo: `PID=$(pgrep -f 'node.*dist/main' | head -1); umask 077; tr '\0' '\n' < /proc/$PID/environ > /tmp/sandbox.env; readlink /proc/$PID/cwd`
8. Detener el proceso: `kill "$PID"` y esperar `while kill -0 "$PID" 2>/dev/null; do sleep 1; done`
9. Build (con el proceso detenido, `nest build` borra `dist/`): `pnpm build`
10. Reiniciar con el mismo env y cwd: `cd ~/tjc-be-test-execution-sandbox/app && set -a && . /tmp/sandbox.env && set +a && nohup node dist/main.js >> ~/sandbox.log 2>&1 &`
11. Borrar el archivo de entorno: `shred -u /tmp/sandbox.env || unlink /tmp/sandbox.env`
12. Health: `curl -s -o /dev/null -w '%{http_code}\n' localhost:${PORT:-3001}/health/ready`
13. Verificar versión desplegada: `git rev-parse HEAD && grep -c WORKSPACE_PROVISIONING_FAILED dist/common/errors/sandbox-fact-error.js && sha256sum dist/workspace/workspace-manager.js | cut -c1-12`

`restore-workspace-acl` NO se ejecuta en el host: corre dentro del contenedor del runner tras cada ejecución PHP (no aplica a este runbook).
Tras el smoke PHP real, adjuntar evidencia (cleanup efectivo, runner leyendo snapshot) para cerrar `executionEvidencePassed`.
