# 008-reliability-lifecycle — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU14, HU19, HU23

## Objetivo

Garantizar cleanup y límites confiables bajo fallos de dependencias, test, timeout o crash parcial.

## Reglas y comportamiento

- Cleanup idempotente.
- Un fallo en cleanup se registra y activa sweeper; no oculta el resultado principal.
- Evitar containers/workspaces huérfanos.
- Health/readiness separa Docker unavailable de app unavailable.
- `GET /health/live` verifica proceso; `GET /health/ready` verifica capacidad de aceptar ejecuciones y reporta dependencias sin revelar configuración sensible.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
