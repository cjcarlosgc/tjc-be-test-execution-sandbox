# Test Execution Sandbox — servicio

Servicio NestJS + TypeScript, gestionado con `pnpm`. La fuente de verdad funcional vive en `../spec/`; este archivo solo cubre cómo correr el código.

## Requisitos

- Node 22, pnpm.
- Docker Desktop activo, o cualquier Docker Engine accesible (incluido el socket de Podman), para `004-container-execution` y `GET /health/ready`.

## Configuración

Copiar `.env.example` a `.env` y completar al menos `SANDBOX_SERVICE_TOKEN` y `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`. El resto de variables tiene defaults razonables para desarrollo local.

## Perfil PHP (`PHP_LARAVEL_PHPUNIT`)

- La primera ejecución PHP construye la imagen `tjc-sandbox-php:8.3` desde `docker/php/Dockerfile` (PHP 8.3 CLI + `unzip` + Composer 2). Requiere red y tarda unos minutos una sola vez; después se reutiliza.
- `composer install --no-scripts` corre con red; los tests corren sin red con `APP_ENV=testing` y un `APP_KEY` aleatorio por ejecución.
- Con `phase` omitido o `GENERATED_TESTS`, PHPUnit ejecuta solo los artefactos generados; cada caso fallido trae `failureKind` (`ASSERTION` o `ERROR`).

## Docker Desktop (macOS) frente a Podman rootless (Linux)

- **Docker Desktop:** los defaults del `.env.example` funcionan tal cual.
- **Podman rootless (p. ej. Fedora/Bazzite):**
  - Activar el socket: `systemctl --user enable --now podman.socket` y definir `SANDBOX_DOCKER_SOCKET_PATH=/run/user/<uid>/podman/podman.sock`.
  - `SANDBOX_CONTAINER_USER=root`: en rootless, el `root` del container es tu usuario del host; un usuario no root del container no puede leer el workspace `0700`.
  - Con SELinux en modo enforcing, usar una raíz de workspaces con etiqueta de container: `mkdir -p ~/.cache/tjc-sandbox-workspaces && chcon -t container_file_t ~/.cache/tjc-sandbox-workspaces` y `SANDBOX_WORKSPACE_ROOT=<esa ruta>`.
- `SANDBOX_ALLOWED_DOWNLOAD_HOSTS` debe incluir el host de Supabase Storage desde el que Core firma las URLs (p. ej. `hhapysqvomhvquylhwvt.supabase.co`).
- El puerto por defecto del ejemplo es `3001` para no chocar con Core (`3000`).

La guía para levantar los cuatro servicios juntos está en `tjc-be-rag-core-api/app/README.md`.

## Comandos

```bash
pnpm install

pnpm run start:dev   # desarrollo, con watch
pnpm run build       # compila a dist/
pnpm run start:prod  # corre dist/main.js

pnpm run lint        # oxlint
pnpm run test        # unit tests (vitest)
pnpm run test:e2e    # e2e (vitest + supertest; requiere Docker para health/container)
```

## Alcance implementado

Ver `harness/progress/current.md` y `harness/reports/` en la raíz del repositorio para el estado exacto y su evidencia de verificación. En resumen: `POST /executions` + polling (`001`), descarga efímera y workspace seguro (`002`), materialización de artefactos (`003`), instalación real de dependencias con `pnpm`/`corepack` y ejecución real de Jest/Vitest dentro de containers Docker aislados (`004`/`005`, `DEC-SBX-002` APROBADO: solo `pnpm`), resultados estructurados con evidencia acotada (`006`/`007`), y `GET /health/live` / `GET /health/ready` (`008`).
