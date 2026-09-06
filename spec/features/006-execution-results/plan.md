# 006-execution-results — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/interoperability-contract.md`.

## Diseño técnico

ResultNormalizer combina stage outcomes, runner JSON y referencias de evidencia. Logs grandes se almacenan mediante `ObjectStorageService` y se devuelven como `StorageObjectRef`; Sandbox conserva hechos y Core interpreta `valid`.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
