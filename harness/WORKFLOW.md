# Harness V2 workflow — Test Execution Sandbox

## Alcance y responsables

Este harness coordina cambios de especificación e implementación sin alterar la frontera ciega del Sandbox. El código de producto vive exclusivamente en `app/`; un work item `HARNESS` no autoriza cambios funcionales, contractuales ni de infraestructura.

Solo existen `leader`, `sdd-analyst`, `implementer`, `contract-reviewer` y `reviewer`. El `leader` es el único dueño de `harness/state.json`: selecciona el corte, **delega**, consolida handoffs, ejecuta fan-in y mueve el estado global. Para cambio no trivial no puede autoafirmar la delegación: el mínimo es `sdd-analyst -> implementer -> reviewer`. Implementer nunca aprueba la revisión final.

Todo subagente devuelve este handoff: `status`, `findings`, `blockers`, `filesAffected`, `evidence`, `recommendedNextStep`. El contexto es mínimo: analyst recibe work item/SDD/contrato/profiles/decisiones; implementer corte aprobado, adapter/profile, contrato y restricciones; contract-reviewer solo contrato/diff/DTOs/adapters; reviewer diff, criterios, pruebas y configuración Docker pertinente. Ningún rol requiere Console, RAG, GitHub, prompts o reglas de negocio.

## Estados, decisiones y reintentos

`SELECTED -> SPEC_VERIFIED -> AWAITING_APPROVAL -> IN_PROGRESS -> IN_REVIEW -> DONE`. Desde un estado no terminal se escala a `BLOCKED` o `DECISION_REQUIRED`, sin inventar resoluciones. Antes de `SPEC_VERIFIED`, analyst revisa PENDING/PROPOSED de las rutas del corte y registra IDs/`Blocks`; una decisión bloquea solo si `Blocks` alcanza ese corte.

`execution.reviewCycles` cuenta devoluciones que requieren corrección y su máximo es `execution.maxReviewCycles` (2). Antes de un tercer ciclo leader escala a `BLOCKED` (falta evidencia/técnica) o `DECISION_REQUIRED` (requiere decisión humana); no reinicia el contador.

## Delegación, fan-out/fan-in y gates

1. Leader registra el work item, ejecuta PULL `start` y delega `sdd-analyst`; registra su handoff antes de `SPEC_VERIFIED`.
2. Si el contrato está en discusión, delega contract-reviewer previo. Delega implementer con corte aprobado; este hace PULL `before-implementation-delivery` antes de `COMPLETED`.
3. Al entrar a `IN_REVIEW`, leader hace PULL `before-review` y **fan-out** a reviewer y, si hay impacto contractual, contract-reviewer. Son revisiones independientes.
4. Leader hace **fan-in**, registra ambos handoffs y gates. Sin impacto contractual, `contractReviewed=NOT_APPLICABLE` exige razón en evidencia, no aprobación simulada.
5. Antes de `DONE`, hace PULL `before-done`, validador y checks técnicos. `DONE` exige gates obligatorios `PASSED`, cero syncs relevantes pendientes y cero decisiones bloqueantes.

El patrón ejecutable está en `harness/examples/fan-out-fan-in.json` y el validador rechaza un cierre que lo viole.

## CONTRACT_SYNC persistente

Los mensajes JSON versionados se conservan en `harness/contract-sync/outbox` e `inbox`. Publicar solo escribe el outbox local; importar copia explícitamente un mensaje recibido al inbox y nunca modifica Core. El protocolo ejecutable está en `harness/contract-sync/README.md`.

PULL es obligatorio en `start`, `before-implementation-delivery`, `before-review` y `before-done`. Un PENDING dirigido a Sandbox es relevante si cambia `/executions`, DTO, `phase`, `executionProfile`, auth, headers, idempotencia, estados o evidencia; se registra y exige contract review. Bloquea DONE hasta que una acción explícita con evidencia lo deje `ACKNOWLEDGED` o `RESOLVED`; nunca se borra. Sandbox solo publica si un cambio contractual suyo ya fue aprobado; Core sigue siendo canónico.

## Checklist de reviewer

Siempre revisa alcance, SDD, contrato, errores, observabilidad, pruebas y evidencia reproducible. Si toca Docker, ejecución no confiable, tokens, red, filesystem, límites o profiles, registra: Sandbox sin credenciales GitHub/RAG; Bearer no debilitado y secretos fuera de container/logs; límites/cleanup/aislamiento preservados; red/capabilities justificadas; y evidencia neutral para que Core clasifique. No existe security-reviewer: estos controles son del reviewer. Si no aplica, `isolationChecksPassed=NOT_APPLICABLE` debe justificarlo.

## Cierre y Git

Antes de cerrar: lint, test, build, typecheck aplicable, validador y pruebas reales si el cambio/entorno lo requieren. Reportes en `harness/reports/`. Commits, revisión de rango y push siguen `spec/constitution/delivery-workflow.md`; este workflow no amplía autorización externa.
