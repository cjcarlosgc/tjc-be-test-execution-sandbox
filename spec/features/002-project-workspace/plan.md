# 002-project-workspace — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/interoperability-contract.md` para `StorageObjectRef`.

## Diseño técnico

WorkspaceManager crea directorio aleatorio bajo root controlado, obtiene snapshot mediante `ObjectStorageService`, verifica integridad, extrae y registra lifecycle. Usar finally + sweeper de residuos huérfanos.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
