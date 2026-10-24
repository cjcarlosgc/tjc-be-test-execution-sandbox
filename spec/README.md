# SDD 3.1 — Test Execution Sandbox

`spec/` es la fuente de verdad del proyecto.

Orden de lectura: `contracts/system-contract.md` -> `contracts/interoperability-contract.md` -> `constitution/project-context.md` -> `constitution/planning-model.md` y constitución aplicable -> `backlog.md`/`operational-cases.md` -> feature `spec.md` -> `plan.md` -> `tasks.md` -> transversales aplicables.

## Contrato entre componentes

[`contracts/system-contract.md`](contracts/system-contract.md) e [`contracts/interoperability-contract.md`](contracts/interoperability-contract.md) son copias espejo byte por byte de los contratos canónicos de RAG Core (hoy `SYSTEM-2.16` e `INTEROP-2.21`, más los esquemas JSON de `contracts/schemas/`). Su propietario es Core; esta copia no puede redefinirlos y se actualiza con Contract Sync.

## Versionado

La especificación vigente se consolida; no se acumulan enmiendas. Los cambios se registran en `CHANGELOG.md` y en Git. `sddVersion: 3.1` identifica la línea base común de los cuatro repositorios. El historial de SDD 2.1 de este repositorio (backlog de 47 HU, estado y validadores V2) se conserva en `spec/legacy/` y `harness/legacy/`.

## Estados de decisión

- **APROBADO:** implementable.
- **PROPOSED:** recomendación técnica aún no aprobada.
- **PENDING:** decisión requerida antes de implementar el punto afectado.

Toda decisión pendiente implementable debe tener ID estable, `Blocks` acotado y una pregunta concreta. `Blocks` indica qué trabajo debe detenerse; no bloquea globalmente el repositorio. `harness/state.json` registra en `decisionGate` solo los IDs aplicables al work item activo.

No existe un registro central adicional que duplique decisiones. Cada decisión vive en la spec dueña; `CHANGELOG.md` registra cuándo cambió.
