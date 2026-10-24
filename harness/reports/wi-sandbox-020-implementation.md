Modelo: leader · configurado claude-opus-5-5 · atendido claude-opus-5-5 · esfuerzo medium

# WI-SANDBOX-020 — `ext-intl` en la imagen PHP gestionada (HU11)

Pedido del usuario (2026-10-24): el piloto experimental RAG vs agente generalista suma repositorios PHP open source; uno de ellos (Billmora, Laravel 12 / PHPUnit 11.5) falla en el Sandbox con `Class "Locale" not found` porque `php:8.3-cli` no trae `ext-intl`. El usuario decidió agregarla al Sandbox.

## Declaración de roles

Análisis e implementación hechos por el leader (sesión del usuario). **Excepción a declarar:** el cambio de `app/docker/php/Dockerfile` supera el umbral de "cambio mínimo" de `AGENTS.md` y debió delegarse a `implementer`; se registra aquí para que el `reviewer` lo evalúe. La revisión independiente del `reviewer` sigue siendo obligatoria antes de `W-DONE`.

## Cambios

- `app/docker/php/Dockerfile`: nueva capa que compila `intl` con `docker-php-ext-install` sobre `libicu-dev`, marca como manuales solo las librerías enlazadas por los binarios de `/usr/local` y purga el resto (patrón de la imagen oficial `php`; se filtran las líneas `diversion` de `dpkg-query`). El build falla si `intl` no queda cargada. La capa de `acl`/`unzip`, Composer, el script ACL y el usuario `sandbox` 10001 no cambian.
- `app/test/full-pipeline.e2e-spec.ts`: el PHPUnit generado del e2e afirma `extension_loaded('intl')` y `Locale::getDisplayLanguage('es', 'es') === 'español'`, junto a la identidad 10001.
- `spec/features/009-execution-profiles/{spec,plan,tasks}.md`, `app/README.md`, `CHANGELOG.md`.

Sin cambios de nombre/etiqueta de imagen (`tjc-sandbox-php:8.3-nonroot`), UID/GID, `CapDrop`, red, límites, instalación Composer, código TypeScript de producto ni contrato HTTP (`contractImpact=false`).

## Verificación (host Linux Bazzite, Podman rootless, SELinux enforcing)

| Check | Resultado |
|---|---|
| `podman build` de `app/docker/php` | OK; `php -m` incluye `intl`; `NumberFormatter('es_PE')` → `S/ 1,234.50`; `setfacl`, `unzip`, `composer`, `id sandbox` = 10001 presentes |
| Paquetes `-dev` en la imagen | idénticos a `php:8.3-cli` (purga limpia); tamaño 551 → 587 MB |
| `pnpm lint` | 0 errores |
| `pnpm test` | 319 pasan, 5 omitidos (los que exigen el CLI `docker`) |
| `pnpm build`, `pnpm contracts:check` | OK |
| e2e real PHP (`full-pipeline`, 3 casos PHPUnit) | 3/3 pasan, con la imagen construida por el propio Sandbox vía Docker API desde el Dockerfile nuevo |
| Prueba negativa | con la imagen construida desde el Dockerfile anterior, `testLaravelTestingEnvironment` falla; con la nueva pasa |
| e2e Node (`full-pipeline`, Vitest) | 3/3 pasan en una corrida aparte (ver abajo) |
| Validadores `validate-work-items`, `validate-harness`, `validate-completions` | OK |
| Repo de la tesis (Billmora @2807b76) con la imagen nueva | el error `Locale` desaparece |

### Cómo se corrió el e2e real en Podman rootless (nota de entorno)

Con Podman rootless el UID 10001 del contenedor no es el dueño del workspace del host, y la ACL `u:10001` del Sandbox no lo alcanza. Por eso el e2e PHP falla igual con o sin este cambio (se comprobó sobre `origin/feature/jean` sin modificaciones). Para reproducir una VM sin tocar la configuración del usuario se usó un servicio Podman temporal en otro socket con `CONTAINERS_CONF_OVERRIDE` → `[containers] userns = "keep-id:uid=10001,gid=10001"`, Node 22 en el host y `TMPDIR` en un directorio de `~/.cache` con etiqueta `container_file_t`. Los casos Vitest se corrieron contra el socket normal con `SANDBOX_CONTAINER_USER=root`, como indica `app/README.md`. En la VM (Docker rootful) no hace falta nada de esto.

## Contract Sync

Checkpoints `start`, `implementation-delivery` y `before-review` registrados en `harness/state.json` sin eventos relevantes pendientes (los cuatro `CS-CORE-*` históricos ya están `C-RESOLVED`). El WI no publica contrato (`publishesContract=false`).

## Runbook de despliegue en la VM (solo imagen; sin reiniciar el Sandbox)

El servicio solo construye la imagen si no existe, así que hay que reconstruirla a mano. Hacerlo entre ejecuciones. Requiere red (apt y Docker Hub).

1. `cd ~/tjc-be-test-execution-sandbox && git pull` (rama ya integrada).
2. Respaldo: `docker tag tjc-sandbox-php:8.3-nonroot tjc-sandbox-php:8.3-nonroot-prev`
3. Reconstruir: `docker build -q -t tjc-sandbox-php:8.3-nonroot ~/tjc-be-test-execution-sandbox/app/docker/php`
4. Verificar: `docker run --rm --entrypoint php tjc-sandbox-php:8.3-nonroot -m | grep -x intl` → `intl`; `docker run --rm --entrypoint id tjc-sandbox-php:8.3-nonroot sandbox` → `uid=10001`.
5. Reversión: `docker tag tjc-sandbox-php:8.3-nonroot-prev tjc-sandbox-php:8.3-nonroot`

El código Node no cambia: no hay `pnpm build` ni reinicio. Sin secretos.
