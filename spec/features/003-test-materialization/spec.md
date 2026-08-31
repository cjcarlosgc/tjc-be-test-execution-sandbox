# 003-test-materialization — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19

## Objetivo

Aplicar artefactos generados al workspace de ejecución sin corromper el snapshot base.

## Reglas y comportamiento

- Soportar CREATED y MODIFIED.
- Rutas siempre relativas y validadas.
- El snapshot original de Object Storage nunca se modifica.
- Para batch, aplicar el conjunto final de artefactos del run.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
