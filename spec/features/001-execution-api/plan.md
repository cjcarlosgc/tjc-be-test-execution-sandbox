# 001-execution-api — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Controller interno + ExecutionService. Definir request/response versionados. Puede ser síncrono respecto del RAG Core si duración/límites lo permiten o asíncrono interno si se decide; el contrato debe conservar executionId.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
