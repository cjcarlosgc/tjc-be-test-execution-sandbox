# WI-SANDBOX-004 — registro Harness del E2E remoto fallido

Fecha: 2026-10-12  
Tipo: HARNESS, sin HU (`storyIds: []`)  
Alcance autorizado: actualización de checkout y prueba E2E con repositorio
propio de demo en la VM existente `rag-test-execution-sandbox`, por IAP-only.

No se crean recursos ni se cambian firewall, VM, contratos o producto. Los
containers y workspaces de la ejecución deben ser efímeros. El estado canónico
de SDD 2.1 / SYSTEM-2.2 no se modifica.

## Precondiciones que debe comprobar el operador IAP

- Checkout final y SHA exacto después de actualizar `origin/feature/jean`.
- En `app/.env`, sin imprimir valores: `PORT=3001`,
  `SANDBOX_SERVICE_TOKEN` no vacío y `SANDBOX_ALLOWED_DOWNLOAD_HOSTS` no vacío.
- `dist/main.js`, `node_modules` y Docker disponibles para el usuario operador.
- Ningún servicio previo escuchando en 3001.

## Evidencia requerida para declarar éxito

1. PID temporal de `node dist/main.js` y sus logs acotados.
2. `GET /health/live` y `GET /health/ready` desde la VM, ambos exitosos.
3. Túnel IAP temporal a 3001.
4. Un request PHP de Core con repositorio demo propio, token de servicio y
   referencia firmada válidos; registrar requestId, executionId, resultado y
   SHA del checkout sin revelar token ni URL firmada.
5. Detener el proceso temporal, cerrar el túnel y verificar limpieza de
   containers/workspaces.

## Coordinación IAP y dependencia actual

Cross ya controla IAP y confirmó que su túnel temporal a 3001 falla porque no
hay backend escuchando todavía; no se requiere que Jean instale ni ejecute CLI
IAP. Jean solo debe iniciar y comprobar el proceso temporal en la VM mediante
su sesión OS Login; Cross abrirá el túnel después. No se solicita ni comparte
ningún código 2FA.

## Binding local temporal

El Core local apunta a `SANDBOX_URL=localhost:3001` y el Sandbox local ocupa ese
puerto. Para este único E2E, se detiene solo el proceso Sandbox local, Cross abre
el túnel IAP `localhost:3001` a la VM:3001 y, al cerrar, se restaura el proceso
local. No se edita `.env` ni se reinicia Core.

## Evidencia operativa — fallos, no éxito

- Health por el túnel temporal: `/health/live` y `/health/ready` respondieron
  HTTP 200.
- Un intento inicial de Core usó requestId `c60a26d3-3cde-40d0-85de-8a826e834b3a`; Sandbox respondió HTTP 401 y no creó una ejecución.
- Tras corregir la configuración del token sin revelar su valor, un POST autorizado fue aceptado: requestId `62c7c017-fc3b-4d11-9e4e-2d6cc0042f20`, executionId `97c5b62e-3b2d-4197-a259-1b32e0babe0a`.
- La ejecución falló en `INSTALLING_DEPENDENCIES`: Composer no pudo encontrar `/app/composer.json`. El objeto temporal de Supabase fue eliminado. No se declara exitoso el E2E y no se debe repetir el POST hasta completar el fix ACL, comprobar el SHA desplegado y recibir autorización operativa aplicable.
- El diagnóstico de permisos posterior mostró que UID 10001 no podía leer ni escribir el workspace `0700`; no se ejecutó smoke ACL porque la VM no tiene `setfacl`. Esto apoya el corte técnico, pero no demuestra por sí solo que ACL ya esté instalada o aplicada.

## Limpieza/cierre del intento — estado no verificado

- El objeto temporal de Supabase consta como eliminado.
- La salida conservada no confirma el estado final de containers Docker ni del workspace de esta ejecución: **desconocido/no verificado**.
- Tampoco conserva una comprobación posterior de que el proceso temporal y el túnel IAP quedaron detenidos: **desconocido/no verificado**. El procedimiento de apagado al final de este documento no prueba que se ejecutó.
- No se hizo un nuevo POST después de este intento. El próximo E2E queda pendiente del WI-SANDBOX-005, del prerequisito ACL en la VM, de verificar el SHA efectivo y de la autorización operativa aplicable.

El E2E no se declara exitoso. Este WI cierra únicamente el registro del intento
y sus fallos observados; no cierra la implementación del profile PHP ni habilita
otra ejecución remota. El work item técnico independiente es WI-SANDBOX-005.

## Apagado seguro del proceso temporal

El operador de la VM debe ejecutar lo siguiente sin elevar privilegios. Si el
PID no corresponde a `node dist/main.js`, el comando falla sin matar nada:

```bash
pid="$(cat /tmp/tjc-sandbox-e2e.pid)" || exit 1
cmd="$(ps -p "$pid" -o args=)" || exit 1
case "$cmd" in *'node dist/main.js'*) ;; *) printf 'PID no corresponde al Sandbox temporal\n' >&2; exit 1;; esac
kill "$pid"
sleep 1
! ss -ltn | grep -q ':3001 '
```
