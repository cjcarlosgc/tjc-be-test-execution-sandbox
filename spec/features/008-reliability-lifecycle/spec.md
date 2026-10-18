# 008-reliability-lifecycle — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU14, HU19, HU24. HU23 está descartada.

## Objetivo

Garantizar cleanup y límites confiables bajo fallos de dependencias, test, timeout o crash parcial.

## Reglas y comportamiento

- Cleanup idempotente.
- Un fallo en cleanup se registra y activa sweeper; no oculta el resultado principal.
- Evitar containers/workspaces huérfanos.
- Health/readiness separa Docker unavailable de app unavailable.
- `GET /health/live` verifica proceso; `GET /health/ready` verifica capacidad de aceptar ejecuciones y reporta dependencias sin revelar configuración sensible.
- Los endpoints health son públicos; todos los endpoints `/executions` conservan Bearer obligatorio.
- El replay de una `requestId` equivalente nunca crea otro container/workspace. Un retry manual real de Core usa otra identidad lógica; no existe autorepair dentro del Sandbox.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.

## Estabilidad del proceso (Fase 3, 2026-10-18)

- **Estado en memoria acotado.** Las ejecuciones terminadas se conservan `SANDBOX_EXECUTION_RETENTION_MS` (24 h por defecto) y, como máximo, `SANDBOX_EXECUTION_MAX_RETAINED` (500); las más antiguas se expulsan. Las ejecuciones en curso nunca se expulsan.
- **Tras un reinicio** todo el estado se pierde: una consulta de Core a una ejecución previa responde `404 EXECUTION_NOT_FOUND`, que Core trata como fallo no transitorio de esa ejecución. Persistir el estado queda fuera de este corte.
- **Concurrencia.** `SANDBOX_MAX_CONCURRENT_EXECUTIONS` (4 por defecto) limita las ejecuciones simultáneas; las demás esperan en `PENDING`.
- **Contenedores huérfanos.** Al arrancar se eliminan los contenedores `sandbox-<executionId>-*` que dejó un proceso anterior (no puede haber ejecuciones en curso al iniciar). `SANDBOX_RECONCILE_ORPHANS_ON_START=false` lo desactiva.
- **Apagado ordenado.** `enableShutdownHooks()` ejecuta los `onModuleDestroy` (barrido de workspaces) ante SIGTERM/SIGINT; `unhandledRejection` se registra sin apagar y `uncaughtException` apaga de forma ordenada con código 1.
- **Entorno validado.** Un valor numérico o booleano mal escrito impide arrancar y se listan todos los problemas, en lugar de caer en silencio al valor por defecto.

