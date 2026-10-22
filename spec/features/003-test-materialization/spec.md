# 003-test-materialization — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU11, HU12, HU17. *(HU antiguas de SDD 2.1 mapeadas a las 18 HU vigentes; ver «Mapa histórico» en `spec/backlog.md`.)*

## Objetivo

Aplicar artefactos generados al workspace de ejecución sin corromper el snapshot base.

## Reglas y comportamiento

- Soportar CREATED y MODIFIED.
- Rutas siempre relativas y validadas.
- El snapshot original administrado por RAG Core nunca se modifica.
- Para batch, aplicar el conjunto final de artefactos del run.
- Cada artefacto llega como metadata + `EphemeralDownloadRef`; el host lo descarga y verifica antes de escribir una ruta relativa validada. El request no incluye contenido arbitrario inline ni una ruta absoluta.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
