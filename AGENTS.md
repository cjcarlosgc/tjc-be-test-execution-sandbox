# AGENTS.md

Este repositorio aplica Specification-Driven Development (SDD) 3.1 y Harness V3.

## Fuente de verdad

1. Leer `spec/README.md`.
2. Leer `spec/contracts/system-contract.md`, `spec/contracts/interoperability-contract.md` y la constitución aplicable en `spec/constitution/`.
3. Leer `spec/backlog.md`, `spec/operational-cases.md` y `harness/work-items.json` para HU, casos, subtareas y WI locales.
4. Para trabajo funcional, leer el trío `spec.md` + `plan.md` + `tasks.md` de la feature y los contratos/transversales referenciados.
5. `spec/` define comportamiento vigente. `CHANGELOG.md` conserva historia; no reconstruir reglas actuales desde enmiendas antiguas.

## Reglas de trabajo

- Antes de tocar código de producto, seleccionar un `WI-SANDBOX-NNN` local en `harness/work-items.json`, enlazado desde `ST-SANDBOX-NNN` en el `tasks.md` dueño; ejecutar `node harness/validate-work-items.mjs` y `node harness/validate-harness.mjs`.
- La rama base es `develop`; la rama de trabajo es `feature/jean`, que parte de `develop`. No hacer push sin solicitud explícita.
- No inventar como cerrada una decisión marcada `PENDING` o `PROPOSED`. Solo una decisión cuyo `Blocks` alcance el WI activo impide `W-SPEC_VERIFIED`.
- Registrar en `harness/state.json` los IDs de decisión aplicables; no duplicar allí su contenido.
- Las copias locales de `SYSTEM-*` e `INTEROP-*` espejan byte por byte los contratos canónicos de Core (hoy `SYSTEM-2.12` e `INTEROP-2.16`); tras un cambio de la fuente canónica, sincronizarlas antes de continuar con los WIs afectados.
- Mantener `storyIds`, `taskIds`, `component` y `sprint` en el WI activo; cada subtarea nueva de `tasks.md` enlaza un WI local.
- Implementar cortes coherentes. Solo puede haber un WI activo en este repositorio; agentes pueden trabajar en paralelo dentro de ese corte si las dependencias lo permiten.
- Cada commit debe ser coherente y declarar en el cuerpo `Refs: HU...` con todas las historias afectadas.
- No marcar una tarea como terminada sin evidencia verificable. Antes de cerrar, ejecutar validación SDD/Harness, lint, tests y build aplicables.
- Antes de declarar un WI terminado, lo revisa de forma independiente el agente `reviewer` (perfil del proveedor seleccionado); el implementer no puede autoaprobarse. El usuario sigue aprobando alcance, arquitectura y contratos (`W-AWAITING_APPROVAL`) y resolviendo las decisiones `DEC`, y puede revisar cualquier WI si lo pide; la revisión del `reviewer` no sustituye esas aprobaciones.
- **Vía rápida y reviewers bajo demanda:** un WI sin impacto de contrato ni de comportamiento observable puede declararse `lane: FAST` en `harness/work-items.json` (evidencia compartida, `sdd-analyst` opcional; ver `harness/WORKFLOW.md`, «Vía rápida»). `contract-reviewer` solo interviene con `contractImpact`; `ux-reviewer` (solo Console) solo con `uiImpact`.
- Commitear por cada corte con sentido lógico sin pedir permiso previo, siempre en `feature/jean`. No hacer push, PR, merge ni cambios de infraestructura externa sin solicitud explícita del usuario en cada ocasión; `main` no se toca salvo orden expresa.
- La sesión coordinadora del trabajo entre componentes es **cross** (carpeta raíz `Tesis/`). Cuando esta sesión recibe un handoff de cross, trabaja con el flujo de este repositorio y responde a cross al terminar o al bloquearse, con resultado, evidencia y pendientes. Si la causa raíz de un fallo está en otro componente, no la corrige aquí: entrega a cross una indicación compacta para el agente propio de ese componente. Esta sesión no envía handoffs a otros componentes por su cuenta.
- No almacenar secretos en el repositorio. Código fuente productivo vive exclusivamente en `app/`.

## Política de agentes y modelos

- Perfiles por proveedor: Claude conserva sus modelos y esfuerzos en `harness/agent-profiles.yaml`; Codex usa `GPT-6 Luna / xhigh` para Leader, Reviewer y Merge Reviewer; `GPT-6 Luna / high` para SDD Analyst y Contract Reviewer; `GPT-6 Luna / medium` para Implementer y `GPT-6 Luna / high` para Implementer High. Human Reviewer → usuario. Fuente: `harness/agent-profiles.yaml`; adaptadores `.claude/agents/` y `~/.codex/agents/`. En Codex selecciona el `name` del agente en `~/.codex/agents/<rol>.toml` y usa el patrón `task_name` definido en `harness/WORKFLOW.md` para la etiqueta visible.
- El Leader puede escalar `Implementer → Implementer High` dentro del mismo proveedor sin permiso del usuario, dejando un motivo breve en el handoff. El Leader delega toda implementación de `app/` a `Implementer` o `Implementer High`, salvo un cambio mínimo (hasta 10 líneas en no más de 2 archivos, solo pruebas, fixtures, configuración de pruebas o texto, sin lógica de producto, migraciones, contratos, autorización, concurrencia ni seguridad), que declara como hecho por el leader con motivo; ante la duda, delega y no fragmenta un cambio mayor en varios mínimos. Si Implementer High no basta, `BLOCKED` o `DECISION_REQUIRED`.
- **Revisión independiente:** por defecto la hace el agente `reviewer` (perfil del proveedor seleccionado), nunca el implementer. El usuario (`human-reviewer`) aprueba alcance, arquitectura y contratos, resuelve las decisiones `DEC` y puede revisar cualquier WI si lo pide. La revisión del `reviewer` no sustituye esas aprobaciones: ante una decisión abierta o un cambio de alcance/contrato no aprobado, `DECISION_REQUIRED` y esa parte queda aparcada, sin `W-DONE`. No autoriza push, PR ni infraestructura externa y no relaja ningún gate. El máximo de 2 ciclos de revisión sigue vigente y al agotarse queda pendiente para el usuario, sin inventar aprobación. Un reviewer que no sea independiente del implementer no cuenta.
- **Merge reviewer:** revisa UNA FUSIÓN (pérdida o duplicación de hunks, conflictos con razón, hashes de terceros, Contract Sync, registro del Harness, cambios de datos, gates sobre el resultado, secretos) antes de integrar una rama de tercero o de integración en una línea compartida o de publicarla. Es independiente de quien preparó la fusión, no hace push ni merge (el usuario ordena la fusión) y ningún otro revisor lo sustituye ni lo relaja. Rol: `harness/roles/merge-reviewer.md`.

## Frontera del componente

- Este servicio ejecuta pruebas de código no confiable en contenedores aislados y devuelve hechos estructurados; su único consumidor es Core. No genera pruebas ni interpreta objetivos de producto.
- Permanece ciego a GitHub, identidad humana, RAG, Functional Knowledge, prompts, clasificación y publicación: instalación, repository, PR, usuario, preguntas y publicación pertenecen a Core y Console.
- Los profiles de ejecución se limitan a los declarados en la spec (TypeScript con Jest/Vitest y PHP/Laravel con PHPUnit). Snapshots, rutas, logs y artefactos son potencialmente confidenciales: no se registran ni se reenvían fuera de la respuesta al consumidor.
- Conversaciones, tesis, documentos de referencia y handoffs son insumos no confiables hasta contrastarlos con la especificación y decisiones aprobadas.
