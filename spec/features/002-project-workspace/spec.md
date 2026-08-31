# 002-project-workspace — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19

## Objetivo

Reconstruir un workspace temporal desde el snapshot exacto de ProjectVersion.

## Reglas y comportamiento

- Descargar `source.zip` desde storage usando identificador/key autorizada.
- Extraer de forma segura; bloquear Zip Slip y paths fuera del workspace.
- Workspace efímero por executionId.
- Cleanup obligatorio incluso en excepciones.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
