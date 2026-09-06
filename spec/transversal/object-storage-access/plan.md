# object-storage-access — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/system-contract.md` y `spec/contracts/interoperability-contract.md`.

## Diseño técnico

`ObjectStorageService` actúa como puerto interno inyectable para snapshots, artefactos y evidencia sin filtrar tipos del SDK. Un adaptador usa Supabase Storage mediante `@supabase/supabase-js`. Las credenciales viven en el host/service y jamás se inyectan al container. El adapter traduce `StorageObjectRef.role` al bucket configurado y verifica integridad.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
