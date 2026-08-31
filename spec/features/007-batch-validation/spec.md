# 007-batch-validation — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU11, HU12, HU14, HU19

## Objetivo

Ejecutar conjuntamente los artefactos actuales de una operación cuando el Core solicite validación batch.

## Reglas y comportamiento

- Batch incluye solo tests generados/modificados por el run actual, no full regression V1.
- Mantener trazabilidad de qué artefactos participaron.
- Un batch no reemplaza resultados individuales requeridos.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
