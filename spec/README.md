# SDD 2.1 — Test Execution Sandbox

`spec/` es la fuente de verdad del proyecto.

Orden de lectura: `contracts/system-contract.md` -> `contracts/interoperability-contract.md` -> `constitution/project-context.md` -> constitución aplicable -> `backlog.md` -> feature `spec.md` -> `plan.md` -> `tasks.md` -> transversales aplicables.

## Contrato entre componentes

[`contracts/system-contract.md`](contracts/system-contract.md) conserva el espejo Sandbox `SYSTEM-2.2`. Su propietario canónico es RAG Core; esta copia no puede redefinirlo. Este corte no cambia la línea base local `SDD 2.1` ni declara homologación global.

[`contracts/interoperability-contract.md`](contracts/interoperability-contract.md) se actualiza a `INTEROP-2.8` para el campo Core→Sandbox `projectRoot`, conforme al alcance de `CS-CORE-20261011-002`; el WI local registra que SYSTEM y la línea base global no cambian en este corte.

## Versionado

La especificación vigente se consolida; no se acumulan enmiendas. Los cambios se registran en `CHANGELOG.md` y en Git. `sddVersion` representa la línea base local del Sandbox: `2.1`; no se declara una línea base global común hasta homologación explícita.

## Estados de decisión

- **APROBADO:** implementable.
- **PROPOSED:** recomendación técnica aún no aprobada.
- **PENDING:** decisión requerida antes de implementar el punto afectado.

Toda decisión pendiente implementable debe tener ID estable, `Blocks` acotado y una pregunta concreta. `Blocks` indica qué trabajo debe detenerse; no bloquea globalmente el repositorio. `harness/state.json` registra en `decisionGate` solo los IDs aplicables al work item activo.

No existe un registro central adicional que duplique decisiones. Cada decisión vive en la spec dueña; `CHANGELOG.md` registra cuándo cambió.
