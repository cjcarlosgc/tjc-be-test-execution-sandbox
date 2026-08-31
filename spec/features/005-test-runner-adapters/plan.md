# 005-test-runner-adapters — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Interface `TestRunnerAdapter` con `supports`, `buildCommand`, `parseResult`. Implementaciones JestTestRunnerAdapter y VitestTestRunnerAdapter.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
