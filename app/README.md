# Test Execution Sandbox — servicio

Servicio NestJS + TypeScript, gestionado con `pnpm`. La fuente de verdad funcional vive en `../spec/`; este archivo solo cubre cómo correr el código.

## Requisitos

- Node 22, pnpm.
- Docker Desktop activo (o cualquier Docker Engine accesible) para `004-container-execution` y `GET /health/ready`.

## Configuración

Copiar `.env.example` a `.env` y completar al menos `SANDBOX_SERVICE_TOKEN` y `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`. El resto de variables tiene defaults razonables para desarrollo local.

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
