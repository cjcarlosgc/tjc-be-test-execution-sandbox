# errors — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Normalizar fallos técnicos para que Core pueda clasificarlos.

## Reglas y comportamiento

- Todo error HTTP usa `ErrorEnvelope` de `INTEROP-1.5` y conserva `x-correlation-id`.
- Requests se validan con whitelist y rechazo de campos desconocidos.
- Errores HTTP se centralizan en filtros; controllers no formatean envelopes manualmente.
- Fallos posteriores al `202` se persisten en la ejecución. Assertions, compilación o dependencias del proyecto no se convierten automáticamente en HTTP 5xx.
- La URL expirada, descarga fallida e integridad inválida usan los códigos de `INTEROP-1.5` sin incorporar la URL ni su token al mensaje persistido.
- Header idempotente ausente/inválido o distinto de `requestId` produce `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_IDEMPOTENCY_KEY` o `IDEMPOTENCY_KEY_MISMATCH`; un replay con huella distinta produce `409 IDEMPOTENCY_CONFLICT`.
- Bearer ausente/inválido produce `401/403` sin revelar si el valor parcial coincidía ni registrar el token.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
