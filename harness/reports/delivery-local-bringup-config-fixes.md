# Revisión de work item — bugs de arranque local (workspace root vacío, config numérica como string)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19 (misma capacidad transversal de `resource-limits`/config, sin HU dedicada propia), más el contrato general de arranque del servicio.
- Contexto: el usuario pidió priorizar las pruebas locales (frontend + RAG Core + Sandbox sobre Docker Desktop) y preguntó qué faltaba para levantar este backend en local, aclarando que no depende de Core ni del frontend en runtime. Al arrancar realmente el servicio (`pnpm start:dev`) con un `app/.env` real en vez de solo correr la suite de tests (que usa `ConfigService` falsos con literales JS), aparecieron dos bugs reales de resolución de configuración que ningún test anterior ejercitaba.
- Por qué los tests no lo detectaron: cada `fakeConfigService` en las pruebas devuelve directamente valores JS ya tipados (`number`, no `string`). Nunca se ejercitó el camino real de `.env` → `process.env` (siempre string) → `ConfigService.get<T>()` (sin coerción en runtime, el genérico es solo un cast de TypeScript). El primer arranque real con un `.env` real fue lo que lo expuso — mismo patrón que el bug de path host/container encontrado antes solo por el e2e con Docker real.

## Hallazgos y cambios

1. **`SANDBOX_WORKSPACE_ROOT=` vacío no caía al default.**
   - Síntoma: `GET /health/ready` → `503`, `workspace: unavailable ("workspace root is not writable")`, con el `.env.example` tal cual (que documenta dejar la variable vacía para usar el default de OS temp).
   - Causa: `configService.get(key, defaultValue)` solo aplica `defaultValue` cuando la clave está *ausente* del store, no cuando está presente con un string vacío. `resolveSandboxLimits` no tenía el fallback explícito que sí tiene `docker-client.provider.ts` para host/socketPath.
   - Fix: `app/src/common/config/sandbox-limits.config.ts` — `workspaceRoot: configService.get('SANDBOX_WORKSPACE_ROOT', '') || DEFAULT_WORKSPACE_ROOT`.

2. **Límites numéricos de container/config llegaban como `string` desde un `.env` real.**
   - Síntoma: con el `.env` real cargado, todo `POST /executions` fallaba en `INSTALLING_DEPENDENCIES` con `failureCode: UNKNOWN` y mensaje `(HTTP code 400) bad parameter - invalid JSON: json: cannot unmarshal string into Go struct field HostConfig.HostConfig.Resources.Memory of type int64` — dockerode serializaba `SANDBOX_CONTAINER_MEMORY_BYTES` como `"268435456"` (string) en vez de `268435456` (number) en el JSON que manda al daemon.
   - Causa: `ConfigService.get<number>(key, default)` no convierte en tiempo de ejecución — el genérico `<number>` no tiene efecto en runtime; cualquier valor real de `.env`/entorno es siempre string.
   - Fix: nuevo `app/src/common/config/get-number-config.ts` (`getNumberConfig(configService, key, defaultValue)`, coerción explícita con `Number()`, cae al default si el valor está ausente/vacío/no numérico). Aplicado en los siete puntos del código que leían un número desde `ConfigService`:
     - `common/config/sandbox-limits.config.ts` (los diez campos numéricos: TTL, deadline, disco, descarga, ZIP).
     - `container/container-limits.config.ts` (memoria, CPU, PIDs, timeouts, output).
     - `container/docker-client.provider.ts` (puerto).
     - `workspace/workspace-sweeper.service.ts` (intervalo del sweeper).
     - `executions/executions.service.ts` (`pollAfterMs` — este además viaja tal cual en la respuesta HTTP `202` a Core; con el bug, violaba el contrato `INTEROP` al tipar un string donde se exige `number`).

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint) y `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 126/126 verdes. Nuevo: `get-number-config.spec.ts` (5 casos: ausente, string vacío, string numérico real, número literal, string no numérico) y `sandbox-limits.config.spec.ts` (3 casos, incluyendo el caso exacto del bug: `SANDBOX_WORKSPACE_ROOT` presente pero vacío).
- `pnpm test:e2e`: 16/16 verdes con Docker Desktop real.
- Verificación manual con el servicio realmente arrancado (`pnpm start:dev`, puerto 3001, `.env` real del usuario, sin modificar valores):
  - Antes del fix: `GET /health/ready` → `503` (`workspace: unavailable`).
  - Después del fix 1: `GET /health/ready` → `200 ready` con los tres checks en verde.
  - Antes del fix 2 (aislado en un test e2e con `.env` real cargado): `POST /executions` completaba en `FAILED`/`INSTALLING_DEPENDENCIES`/`UNKNOWN` en ~350ms (Docker rechazaba el `HostConfig` antes de siquiera arrancar el container).
  - Después del fix 2: la suite e2e real (descarga HTTPS real, `pnpm install` real con red, `vitest run` real sin red, todo dentro de Docker) vuelve a completar en `COMPLETED` con facts reales.
  - `Authorization` Bearer guard verificado manualmente (401 sin header, 401 con token incorrecto).

## Manejo de errores y seguridad

- Ningún límite se vuelve controlable por el request de Core: `getNumberConfig` sigue leyendo exclusivamente de `ConfigService`, nunca del DTO.
- El fallback de `getNumberConfig` a `defaultValue` ante un valor no numérico evita que un `.env` mal editado tumbe el arranque con un `NaN` propagado silenciosamente hasta el daemon de Docker o hasta el contrato HTTP con Core.

## Observabilidad mínima

- Sin cambios de logging: estos son bugs de resolución de configuración, no de manejo de errores de ejecución; el fallo ya se reportaba correctamente vía el mecanismo existente de `SandboxFactError`, solo con una causa raíz de infraestructura no evidente hasta que se leyó `failureMessage`.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita. El usuario ya autorizó commits en general pero explícitamente pidió no hacer push todavía ("no pushees aun").
