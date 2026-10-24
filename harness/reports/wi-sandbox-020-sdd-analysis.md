Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-020 — análisis SDD

Veredicto: SPEC_VERIFIED. Cambios pendientes: ninguno.

1. Digests: system d0a492b4… (system-contract.md:3 SYSTEM-2.16), interoperability 7f946d55… (interoperability-contract.md:3 INTEROP-2.21, compatible SYSTEM-2.16), árbol schemas 8079ab73… (35 archivos, igual que Core 2318b9df). Ambos contratos y los 35 archivos de schemas coinciden (cmp) con `git show 2318b9df`.
2. CS-CORE-20261024-004.yaml:9 declara que SUPERA a -001..003 y 20261021-001..004 en INTEROP/SYSTEM (re-espejo directo a 2.21/2.16); schemas 8079ab73… idénticos en -002 y -004.
3. Delta vs HEAD (solo 4 archivos de spec/contracts): sandbox-result.failed.json COMPOSER_INSTALL_FAILED -> DEPENDENCY_INSTALL_FAILED; manifest.json +75 líneas (nuevo esquema github-webhook-event y sus 15 ejemplos); prosa neutral del LLM en INTEROP 6.5/6.5.1 y SYSTEM; targetId en ExperimentResultsResponse. Sin cambio de rutas/DTO/enums/códigos del Sandbox; el github-webhook-event no lo usa el Sandbox.
4. generated/*: solo adiciones (0 líneas eliminadas), todas del esquema github-webhook-event (contract-schemas.ts +760, contract-types.ts +196). `pnpm contracts:check` exit 0.
5. Código coherente: app/src/common/errors/sandbox-fact-error.ts:87 usa DEPENDENCY_INSTALL_FAILED; execution-pipeline.service.spec.ts:626 y :839 lo esperan. Sin referencias a COMPOSER_INSTALL_FAILED en app/src.
6. Versiones: AGENTS.md:19 y spec/README.md:9 ya citan SYSTEM-2.16/INTEROP-2.21; CHANGELOG.md línea 9 documenta WI-SANDBOX-020.
7. DEC: ninguna con Blocks sobre este WI (WI documental; sin DEC en work-items/state aplicable).
