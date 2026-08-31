# timeouts-cleanup — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Timeout por fase y global configurables. Kill -> collect evidence posible -> remove container -> cleanup workspace.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
