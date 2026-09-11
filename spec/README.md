# SDD — Test Execution Sandbox

`spec/` es la fuente de verdad del proyecto.

Orden de lectura: `contracts/system-contract.md` -> `contracts/interoperability-contract.md` -> `constitution/project-context.md` -> constitución aplicable -> `backlog.md` -> feature `spec.md` -> `plan.md` -> `tasks.md` -> transversales aplicables.

## Contrato entre componentes

[`contracts/system-contract.md`](contracts/system-contract.md) es la copia espejo `SYSTEM-1.4` del contrato común de los tres componentes. Su propietario canónico es RAG Core; esta copia no puede redefinirlo.

[`contracts/interoperability-contract.md`](contracts/interoperability-contract.md) es la copia espejo `INTEROP-1.5` con rutas, DTOs, estados, errores y transporte universales.

## Versionado

La especificación vigente se consolida; no se acumulan enmiendas. Los cambios se registran en `CHANGELOG.md` y en Git. `sddVersion` representa la línea base conjunta de los tres repositorios.

## Estados de decisión

- **APROBADO:** implementable.
- **PROPOSED:** recomendación técnica aún no aprobada.
- **PENDING:** decisión requerida antes de implementar el punto afectado.

Toda decisión pendiente implementable debe tener ID estable, `Blocks` acotado y una pregunta concreta. `Blocks` indica qué trabajo debe detenerse; no bloquea globalmente el repositorio. `harness/state.json` registra en `decisionGate` solo los IDs aplicables al work item activo.

No existe un registro central adicional que duplique decisiones. Cada decisión vive en la spec dueña; `CHANGELOG.md` registra cuándo cambió.
