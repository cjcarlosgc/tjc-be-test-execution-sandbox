# 004-container-execution — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU23

## Objetivo

Ejecutar instalación, compilación y tests dentro de un container aislado y acotado.

## Reglas y comportamiento

- Crear container por executionId.
- CPU, memory y timeout configurables.
- Montar solo workspace requerido.
- No privileged, no Docker socket, user no-root cuando imagen/proyecto lo permitan.
- Capturar exit codes por etapa.
- Destruir container al terminar o expirar.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
