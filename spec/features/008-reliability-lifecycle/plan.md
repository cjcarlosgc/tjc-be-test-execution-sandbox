# 008-reliability-lifecycle — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

LifecycleCoordinator mantiene state machine y finally cleanup. Sweeper periódico por TTL. Métricas de active containers/workspaces/cleanup failures.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
