# 002-project-workspace — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19

## Objetivo

Reconstruir un workspace temporal desde el snapshot exacto de ProjectVersion.

## Reglas y comportamiento

- Descargar inmediatamente el ZIP mediante `EphemeralDownloadRef` (`PROJECT_SNAPSHOT`) y un puerto HTTP interno inyectable; aceptar solo HTTPS, host permitido y referencia no expirada.
- Verificar SHA-256 y tamaño antes de extraer.
- Aplicar timeout, redirects/retries acotados, límite de bytes durante descarga y rechazo de archivos excesivamente grandes.
- Extraer de forma segura; bloquear Zip Slip/path traversal, entradas absolutas o fuera del workspace, enlaces peligrosos y expansión desproporcionada/zip bombs.
- Workspace efímero por executionId.
- Cleanup obligatorio incluso en excepciones.
- No persistir ni loguear completa la URL; no entregarla al container.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
