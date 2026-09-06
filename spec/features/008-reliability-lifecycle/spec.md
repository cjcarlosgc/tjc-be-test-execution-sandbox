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
