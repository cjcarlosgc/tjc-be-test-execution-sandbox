# object-storage-access — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/system-contract.md` y `spec/contracts/interoperability-contract.md`.

## Diseño técnico

`ExecutionInputDownloadService` actúa como puerto interno inyectable para snapshots y artefactos sin conocer el proveedor. El adaptador HTTP valida HTTPS/allowlist/expiración, limita la descarga, verifica tamaño y SHA-256, y entrega bytes al `WorkspaceManager`. La referencia no llega al container ni se conserva en estado/logs.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
