# 001-execution-api — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19

## Objetivo

Aceptar solicitudes internas de ejecución y devolver un identificador/resultado trazable.

## Reglas y comportamiento

- `POST /executions` valida contract y correlationId.
- Debe recibir identificadores suficientes para obtener el snapshot exacto y los artefactos generados.
- Rechazar paths/inputs inválidos antes de crear container.
- No aceptar strategy RAG/BASELINE porque no es responsabilidad del Sandbox.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
