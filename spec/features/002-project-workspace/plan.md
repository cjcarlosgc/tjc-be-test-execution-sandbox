# 002-project-workspace — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/interoperability-contract.md` para `EphemeralDownloadRef`.

## Diseño técnico

`WorkspaceManager` crea un directorio aleatorio bajo una raíz controlada. Un `ExecutionInputDownloadService` inyectable descarga la URL firmada sin exponer detalles de Supabase, aplica límites y verifica integridad antes de una extracción segura. Usar `finally` y un sweeper para residuos huérfanos.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
