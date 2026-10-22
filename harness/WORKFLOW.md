# Harness V3 — Test Execution Sandbox

El Harness ejecuta **work items locales** en `harness/work-items.json`. La planificación global de épicas, HU, OC e ideas vive en `spec/`; `harness/state.json` conserva el WI activo y snapshots verificables al cerrarlos. Ver `spec/constitution/planning-model.md` para identidades y estados.

## Ciclo de un WI

`W-PLANNED → W-READY → W-SELECTED → W-SPEC_VERIFIED → W-AWAITING_APPROVAL → W-IN_PROGRESS → W-IN_REVIEW → W-DONE`. `W-BLOCKED`, `W-DECISION_REQUIRED` y `W-CANCELLED` son salidas explícitas con motivo/evidencia. Un WI terminado se retira de `activeWorkItem`; su snapshot, reporte y Git conservan evidencia. `W-READY` exige HU, taskIds, componente, criterios, dependencias y rutas. Solo puede existir un WI activo local.

1. **Pre-tarea:** leader selecciona WI, verifica `dependsOn`, hace PULL Contract Sync `start` y asigna análisis SDD, decisiones `Blocks`, criterios, límites y riesgos. Contract-reviewer evalúa cambios contractuales. Cambio funcional, arquitectónico o de contrato requiere aprobación humana antes de implementar.
2. **Durante la tarea:** implementer trabaja el corte aprobado. Subtareas independientes pueden correr en paralelo; dependencias reales se respetan. Antes de entregar: PULL `implementation-delivery`, checks y evidencia.
3. **Post-tarea:** PULL `before-review`, revisión independiente y contract-reviewer si aplica. La revisión independiente la hace por defecto el agente `reviewer`; el usuario revisa un WI cuando lo pide. El leader consolida handoffs, resuelve hallazgos (máximo dos ciclos), hace PULL `before-done`, valida gates y registra el cierre. La revisión acumulada previa al push es distinta.

Las asignaciones pueden quedar vacías antes de designar responsables. En `W-IN_REVIEW`, `implementationAgent` y `reviewAgent` deben identificar responsables distintos; usa `human-reviewer` por defecto y `reviewer` solo si el usuario delegó. Un handoff aprobado no es por sí mismo un gate aprobado.

**Trazabilidad de modelo.** Todo handoff de agente IA y todo reporte nuevo en `harness/reports/` generado por un agente declara con qué modelo se hizo la tarea: en handoffs, el objeto `executedBy: { agent, configuredModel, servedModel, effort }`; en reportes Markdown, la línea `Modelo: <agent> · configurado <exactModelId> · atendido <exactModelId|unknown> · esfuerzo <low|medium|high|xhigh>`. `configuredModel` y `effort` se copian del proveedor seleccionado en `harness/agent-profiles.yaml` (`claude` o `codex`). `servedModel` es el modelo realmente observado; si no se pudo observar, se escribe `unknown`, nunca se asume igual al configurado. Una escalada `implementer → implementer-high` se anota con motivo breve. El handoff del `human-reviewer` no lleva modelo. El campo es informativo, no sustituye gates ni la revisión humana y el validador no lo exige.

**Nombre visible de subagentes por proveedor.** En Codex, delega cada WI con `task_name` en el formato `rol_gpt6_luna_esfuerzo___wi_componente_numero_corte`; usa solo minúsculas, dígitos y `_`, exactamente tres `_` como separador antes de `wi`. El modelo actual es `gpt6_luna`; el esfuerzo se copia del perfil Codex activo (`medium`, `high` o `xhigh`). Convierte guiones del rol a `_` (`sdd_analyst`, `contract_reviewer`, `implementer_high`, `merge_reviewer`); usa `gh` como componente, el número WI con tres dígitos y un slug breve de corte (`a`, `b`, etc.). Ejemplo: `contract_reviewer_gpt6_luna_high___wi_gh_012_a`. El `task_name` es solo la etiqueta visible: selecciona el perfil por su `name` en `~/.codex/agents/<rol>.toml` y conserva el primer reporte con el formato humano `[contract-reviewer::GPT-6 Luna / high] · WI-SANDBOX-012 · Corte A`. No uses `nickname_candidates` para titular tareas. En Claude, conserva `description` = `[<rol>::<modelo>] · WI-… · <corte>`; el hook `.claude/hooks/check-subagent-title.mjs` sigue validando ese formato.

**Delegación de implementación.** El leader delega toda implementación de `app/` a `implementer` o `implementer-high` con el perfil del proveedor seleccionado, salvo un **cambio mínimo**: hasta 10 líneas en no más de 2 archivos, solo pruebas, fixtures, configuración de pruebas o texto, y sin lógica de producto, migraciones, contratos, autorización, concurrencia ni seguridad. Todo lo demás, y cualquier duda, se delega. Un cambio mínimo hecho por el leader se declara: `executedBy` con `agent: leader`, motivo `cambio mínimo`, archivos y líneas tocados, y la línea `Modelo:` del reporte. No se fragmenta un cambio mayor en varios mínimos. Ver `harness/roles/leader.md` y `AGENTS.md`.

**Revisión independiente.** por defecto la hace el agente `reviewer` (perfil del proveedor seleccionado), nunca el implementer. El usuario (`human-reviewer`) aprueba alcance, arquitectura y contratos, resuelve las decisiones `DEC` y puede revisar cualquier WI si lo pide. La revisión del `reviewer` no sustituye esas aprobaciones: ante una decisión abierta o un cambio de alcance/contrato no aprobado, `DECISION_REQUIRED` y esa parte queda aparcada, sin `W-DONE`. No autoriza push, PR ni infraestructura externa y no relaja ningún gate. El máximo de 2 ciclos de revisión sigue vigente y al agotarse queda pendiente para el usuario, sin inventar aprobación. Un reviewer que no sea independiente del implementer no cuenta.

**Merge reviewer.** Toda fusión de una rama de tercero o de integración se revisa con el agente `merge-reviewer` y el perfil del proveedor seleccionado antes de entrar en `feature/jean`, `develop` o `main` y antes de publicarla. Revisa la fusión completa (no el trabajo de un WI), escribe `harness/reports/merge-review-<scope>.md` y no hace push ni merge: el usuario ordena la fusión. Ningún otro revisor lo sustituye ni lo relaja; no sustituye decisiones `DEC` ni aprobaciones del usuario.

## Vía rápida (`lane: FAST`)

Carril liviano para cambios **pequeños o de limpieza** que no alteran el comportamiento observable del producto ni ningún contrato. Un WI lo declara con el campo opcional `lane` en `harness/work-items.json` (`"STANDARD"` por defecto, `"FAST"`).

- **Aplica solo si:** `contractImpact=false` y `publishesContract=false`, sin migraciones, autorización, seguridad ni concurrencia, y sin cambio de UI relevante. Si el trabajo crece o toca alguno de esos puntos, el leader lo pasa a `STANDARD` antes de seguir.
- **Qué se simplifica:** el WI sigue registrado (ID, subtarea `ST-*`, HU, un solo WI activo), pero el `sdd-analyst` es opcional (el leader verifica la spec) y la evidencia puede ser **un único reporte compartido** (`harness/reports/fast-lane-<alcance>.md`) en lugar de uno por WI.
- **Qué no se simplifica:** lint, tests y build en verde; checkpoints de Contract Sync; revisión independiente del `reviewer` con handoff aprobado; `noBlockingDecisions`; commits coherentes con `Refs:`.
- El validador (`validate-work-items.mjs`) rechaza `lane: FAST` con impacto de contrato.

## Reviewers bajo demanda

`sdd-analyst`: obligatorio salvo en vía rápida. `contract-reviewer`: solo si el WI tiene `contractImpact=true`. `ux-reviewer` (solo Console): solo si el WI tiene `uiImpact=true`. `reviewer`: siempre, para todo WI. `merge-reviewer`: solo para fusiones.

## Gates

Los valores son `G-NOT_RUN`, `G-PASSED`, `G-FAILED`, `G-NOT_APPLICABLE`. Para `W-DONE` pasan `sddVerified`, `implementationCompleted`, `independentReviewPassed`, `technicalChecksPassed`, `interopSyncChecked`, `noBlockingDecisions` y `retryLimitRespected`. Si `contractImpact=true`, pasan además `contractReviewed` y `canonicalContractSynced`. `contractSyncPublished` pasa solo si `publishesContract=true` y hay evento en outbox; de lo contrario es `G-NOT_APPLICABLE`. Cada gate tiene evidencia reproducible.

Contract Sync se ejecuta en `start`, `implementation-delivery`, `before-review` y `before-done`. Todo evento relevante que no esté `C-RESOLVED` bloquea el gate interop. No se inventa un endpoint ni se modifica el consumidor a partir de una notificación.

Los Contract Sync nuevos usan `CS-CORE-*`, `CS-CONSOLE-*`, `CS-SANDBOX-*` o `CS-SANDBOX-*` y requieren `sourceWorkItem` de ese componente. Los IDs simples anteriores al corte siguen legibles sin reescritura. Este Harness solo valida WIs de su propio repositorio; dependencias entre componentes requieren comprobar manualmente el estado/evidencia del WI origen además de importar y resolver su evento. `dependsOn` no acepta IDs de otro repo.

Las importaciones de Contract Sync registran `consumerImportedAt` local. El validador de completions ignora eventos que llegaron después del `closedAt` del snapshot histórico, sin excluirlos para WIs activos o futuros; los eventos antiguos sin marca se tratan de forma conservadora.

## Validación local

```sh
node scripts/sdd-check.mjs
node harness/validate-work-items.mjs
node harness/validate-harness.mjs
```

Al seleccionar trabajo de servicio, añadir comandos de lint, test y build del paquete real. No hacer push, PR, merge ni cambios de infraestructura externa sin solicitud explícita del usuario.

**Perfiles y escalamiento:** los perfiles de agentes viven en `harness/agent-profiles.yaml` y se materializan en `.claude/agents/` o `~/.codex/agents/`. El leader puede escalar `implementer` a `implementer-high` dentro del mismo proveedor, con motivo trazado; no escala automáticamente a otro rol o modelo (`BLOCKED`/`DECISION_REQUIRED`). El reviewer independiente por defecto es el agente `reviewer`; el `human-reviewer` (usuario) aprueba alcance, arquitectura, contratos y decisiones `DEC`.
