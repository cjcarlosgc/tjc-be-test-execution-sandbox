# errors — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Distinguir invalid request, storage, dependency install, configuration, compile, test runtime y infrastructure. No usar 5xx para representar assertion failure cuando la ejecución funcionó.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
