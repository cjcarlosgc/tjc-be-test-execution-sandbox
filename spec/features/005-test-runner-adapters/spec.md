# 005-test-runner-adapters — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU12, HU17. *(HU antiguas de SDD 2.1 mapeadas a las 18 HU vigentes; ver «Mapa histórico» en `spec/backlog.md`.)*

## Objetivo

Normalizar Jest y Vitest a un resultado común.

## Reglas y comportamiento

- Detectar adapter compatible desde metadata/config del proyecto.
- Preferir output JSON estructurado.
- No inferir success solo por texto si existe JSON.
- Unsupported runner devuelve CONFIGURATION/UNSUPPORTED contract según acuerdo con Core.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
