# Modelo de planificación y ejecución

**Estado:** aprobado para Core, Console y Test Execution Sandbox. Sandbox se homologa en un corte posterior; no editar su repositorio ahora.

| Nivel | Identidad | Ubicación | Qué decide |
| --- | --- | --- | --- |
| Épica | `EP01`–`EP06` | `spec/backlog.md` | Área de valor fija; no se abren épicas en el flujo ordinario. |
| Historia | `HU01`–`HU18` | `spec/backlog.md` + feature | Resultado observable transversal; no se abre una HU por cada idea. |
| Caso | `OC01`–`OC15`, luego `OCxx.a` | `spec/operational-cases.md` + feature | Escenario y subcasos aprobados; no es una tarea. |
| Subtarea | `ST-<COMP>-<NNN>` | `spec/features/<feature>/tasks.md` | Trabajo técnico verificable que declara HU, componente y WI. |
| Work item | `WI-<COMP>-<NNN>` | `harness/work-items.json` + `harness/state.json` | Corte ejecutable local con gates, revisiones y evidencia. |
| Idea | `IDEA-<NNN>` | `spec/ideas.md` | Propuesta sin compromiso de implementación. |

`COMP` es `CORE`, `CONSOLE`, `SANDBOX` o `SANDBOX`. HU y OC son globales; los WI pertenecen al repositorio que cambia. Cada subtarea técnica implementada se vincula a un WI local. Historias, casos y subtareas son Markdown; el Harness JSON contiene el estado de trabajo ejecutable, no una segunda copia de las historias.

## Estados

- Idea: `I-CAPTURED → I-TRIAGED → I-BACKLOGGED → I-SELECTED`; salida `I-DECLINED`.
- HU: `H-BACKLOGGED → H-READY → H-IN_PROGRESS → H-DONE`; `H-RETIRED` solo por decisión explícita. `H-DRAFT` permite corregir el texto de una HU existente.
- Caso: `O-CATALOGUED → O-READY → O-IN_PROGRESS → O-COVERED`; `O-DEFERRED` conserva un caso sin prometer cobertura.
- Subtarea: `T-BACKLOGGED → T-READY → T-IN_PROGRESS → T-DONE`; `T-CANCELLED` conserva el descarte.
- WI: `W-PLANNED → W-READY → W-SELECTED → W-SPEC_VERIFIED → W-AWAITING_APPROVAL → W-IN_PROGRESS → W-IN_REVIEW → W-DONE`; salidas `W-BLOCKED`, `W-DECISION_REQUIRED`, `W-CANCELLED`.
- Decisión: `D-PROPOSED`, `D-PENDING`, `D-APPROVED`, `D-REJECTED`; `Blocks` delimita alcance.
- Contract Sync: `C-PENDING`, `C-ACKNOWLEDGED`, `C-RESOLVED`, `C-REJECTED`.
- Gate: `G-NOT_RUN`, `G-PASSED`, `G-FAILED`, `G-NOT_APPLICABLE`; gate es comprobación con evidencia, no fase.

## Flujo resumido

1. Ideas nuevas no crean automáticamente épicas, HU ni WI. Se encajan al seleccionarse en una de las 18 HU fijas o piden cambio explícito de alcance.
2. Se define una subtarea en su feature y WIs por componente. `dependsOn` solo marca bloqueos reales.
3. Hay un WI activo por repositorio. Core, Console y SANDBOX pueden tener cortes activos en paralelo si contrato y dependencias lo permiten; dentro del WI también se admite paralelismo.
4. Al seleccionar WI: Contract Sync `start`, análisis de spec/decisiones/dependencias y aprobación humana de cambio funcional/contractual/arquitectónico antes de implementar.
5. Durante el trabajo: Contract Sync `implementation-delivery`; antes de revisión: `before-review`. Revisión humana por defecto.
6. Antes de `W-DONE`: `before-done`, gates y evidencia. Una HU solo llega a `H-DONE` al completar criterios con aceptación verificable.

Para retirar una capacidad se registra subtarea/WI con alcance de eliminación y preservación de datos. No se borra una HU aceptada ni datos sin inventario, decisión y respaldo.
