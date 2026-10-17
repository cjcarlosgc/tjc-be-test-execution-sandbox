# CONTRACT_SYNC CS-CORE-20261012-002 — acuse informativo

Fecha: 2026-10-12. Resultado: `ACKNOWLEDGED`, **no relevante** para el Sandbox; sin cambio funcional ni de contrato, sin impacto en WI-SANDBOX-005.

## Qué es

Core corrige solo la procedencia (`sourceRevision` → `a7c04cef12740941d8559c743f84ed287fb57ced`) del evento `CS-CORE-20261009-016` (INTEROP-2.7 §7: `failureKind`, `phase`, `TEST_COMPILATION_FAILED`, `IMAGE_UNAVAILABLE`). La acción requerida es de Console (espejar INTEROP-2.7 desde ese commit). El evento original queda intacto.

## Importación

El evento de Core es YAML con `targets: [console, sandbox]`, sin `changedContractAreas` ni `createdAt`; el harness del Sandbox solo importa JSON con ese esquema. Se tradujo a `harness/contract-sync/inbox/CS-CORE-20261012-002.json`: `targets` reducido a `sandbox` (valor original en `originalTargets`), `changedContractAreas: [phase, evidence]` derivado del tema, `createdAt` = hora de importación, y el YAML original completo y sin editar en `sourceEventYaml`. Fuente: `../tjc-be-rag-core-api/harness/contract-sync/outbox/CS-CORE-20261012-002.yaml`.

## Evidencia de no relevancia

- `spec/contracts/interoperability-contract.md` del Sandbox ya contiene `failureKind`, `TEST_COMPILATION_FAILED` e `IMAGE_UNAVAILABLE` (aditivo 2026-10-09) y el código los implementa; el evento no cambia su contenido.
- No modifica rutas, DTO, headers, estados ni `projectRoot`/ACL; WI-SANDBOX-005 no depende de la procedencia.
- No toca Core, Console, la VM ni infraestructura.
