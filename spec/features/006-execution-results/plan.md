# 006-execution-results — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/interoperability-contract.md`.

## Diseño técnico

`ResultNormalizer` combina resultados de etapas y JSON del runner con `ExecutionEvidenceFact` acotados. Sandbox conserva hechos operativos solo lo necesario para `202 + polling`, los devuelve a Core y limpia el workspace; Core interpreta `valid` y persiste el resultado.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
