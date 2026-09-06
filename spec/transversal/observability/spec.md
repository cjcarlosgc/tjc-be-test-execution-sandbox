# observability — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Trazar ejecución sin filtrar secretos ni logs ilimitados.

## Reglas y comportamiento

- Propagar `x-correlation-id` y registrar `requestId`, `executionId`, `testRunId` y `projectVersionId` sin duplicar contenido del código.
- Registrar transiciones, stage durations, exit codes, runner/runtime, uso de recursos y resultado de cleanup.
- Redactar secretos y acotar stdout/stderr; `ExecutionEvidenceFact` declara truncamiento y tamaño original cuando sea observable.
- No registrar URLs firmadas completas, query strings/tokens de descarga, headers de autorización, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` ni `DATABASE_PASSWORD`.
- No registrar estrategia experimental ni inferir conclusiones, porque el Sandbox permanece ciego.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
