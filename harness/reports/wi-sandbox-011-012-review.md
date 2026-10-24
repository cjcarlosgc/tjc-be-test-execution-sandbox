Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revision independiente retroactiva — WI-SANDBOX-011 y WI-SANDBOX-012 (vía rápida, trabajo de cross)

Base revisada: HEAD 5d83838 (rama feature/jean). Reviewer distinto del implementationAgent (cross). Sin cambios al repositorio salvo este reporte.

## Veredictos
- WI-SANDBOX-011 (HARNESS): **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR).
- WI-SANDBOX-012 (PRODUCT): **APPROVED** (0 BLOCKER, 0 MAJOR, 2 MINOR).

## Comandos ejecutados (todos en verde)
Raíz: `node scripts/sdd-check.mjs` (SDD check OK); `node harness/validate-work-items.mjs` (6 WI); `node harness/validate-harness.mjs` (V3 passed); `node harness/validate-completions.mjs` (1 WI completado); `node --test harness/*.test.mjs` (agent-assignment 5, contract-sync-lifecycle 4, contract-sync 7, validate-completions 9; 0 fallos).
app/: `pnpm lint` (0), `pnpm test` (281 pasan, 4 omitidos), `pnpm build`, `pnpm contracts:check` (0).
Drift/determinismo: `pnpm contracts:generate` dos veces → md5 idéntico en ambos archivos generados y `git status` limpio (determinista). Se insertó `"zzdrift"` en el primer `required` de `spec/contracts/schemas/sandbox-execution.schema.json` → `contracts:check` falló con `DESACTUALIZADO: contract-schemas.ts`, exit 1; restaurado con `git checkout`, `git status` limpio.
Barridos: `git grep` de IPv4, sslip/nip/compute, credenciales/claves; `awayMode`.

## WI-SANDBOX-011
Verificado:
- Validadores V3 no debilitados: `validate-harness.mjs` pasa de una expresión única a aserciones individuales y ejecuta además work-items, completions y 4 suites de tests; `sdd-check.mjs` amplía archivos requeridos y exige sddVersion 3.1/schemaVersion 4 (diff vs 87499ab). Se conservan checks V2 (ciclos de revisión, handoff, gates, checkpoints). Versiones V2 preservadas en harness/legacy.
- Historia: único archivo del árbol spec/ desaparecido respecto de 87499ab es `spec/backlog-migration-sdd-2.0.md`, movido (rename) a `spec/legacy/`; se añade `spec/legacy/backlog-sdd-2.1.md` y `harness/legacy/*` (state 2.1, WORKFLOW-v2, validadores V2); contract-sync outbox JSON conservado en `harness/legacy/contract-sync-json`.
- Backlog: 18 HU (HU01–HU18, spec/backlog.md:26-43) con sección «Participación de Sandbox» (HU11/12/13/17) y «Mapa histórico SDD 2.1 → vigente» (backlog.md:77-89) que conserva la trazabilidad de HU antiguas (incl. HU23 descartada).
- `awayMode`: no existe en state.json; solo aparece en harness/legacy/state-sdd-2.1.json, en la aserción que lo prohíbe (validate-harness.mjs:58) y en state-schema.md:77.
- `.claude`: 7 agentes (incluye implementer-high, merge-reviewer), `settings.json` solo con un hook PreToolUse(Agent) y `check-subagent-title.mjs` (título `[perfil::modelo] · WI · corte`), coherente con validate-harness (que exige los 7 agentes y los modelIds de agent-profiles.yaml).
- Secretos/VM: no hay IP pública, hostname real ni credenciales en el árbol actual. Solo `<SANDBOX_HOST>.sslip.io`/`<SANDBOX_IP>` (placeholders), el rango público IAP `35.235.240.0/20`, y nombres `rag-test-execution-sandbox`/`rag-sandbox-ip` (aceptados por decisión del usuario).

Hallazgos:
- MINOR-1 `harness/validate-harness.mjs:89-96`: las excepciones de ciclos de revisión (3, 4 y 5) están fijadas por frase literal; la de 5 ciclos (`...quinto ciclo... limitado a WI-SANDBOX-012`) no comprueba que `item.id` sea WI-SANDBOX-012, por lo que cualquier WI podría usarla. Introducido en c110f84 por homologación; no hay uso fuera de lo declarado. Sugerencia: atar la excepción al id del WI.
- MINOR-2 Higiene del registro: el reporte retroactivo declara reproducibilidad pero la frase «esta vez que lo revise el reviewer, si todo okle das en DONE» queda como cita de ejemplo codificada en el validador (misma raíz que MINOR-1; lenguaje informal en código de validación).

## WI-SANDBOX-012
Verificado:
- Generador `app/scripts/generate-contract-types.mjs`: determinista (esquemas ordenados, sin timestamps), `--check` compara byte a byte y sale 1 ante drift o archivo ausente (probado).
- Test de contrato `executions.contract.spec.ts`: arma el módulo Nest real (controlador, servicio, guard, filtro, ValidationPipe) y valida con Ajv respuestas HTTP reales (202, GET status, GET result con registro terminal, ErrorEnvelope en 400/401/404) contra esquemas; no es tautológico: además afirma igualdad de contenido con los ejemplos (`facts`, `stageDurations`, `evidence`) y valida los requests canónicos contra el esquema antes de enviarlos. El validador usa `strict: true` y `allErrors`, y no incluye valores del payload en errores.
- Sin cambio observable: el diff de `responses.ts` y `sandbox-execution.contract.ts` es solo de tipos (type aliases a tipos generados); no hay cambios de runtime en controlador/servicio; 281 tests existentes siguen pasando.
- `as T` en la frontera nueva: ninguno sobre payloads de red.

Hallazgos:
- MINOR-3 `app/src/contracts/contract-validator.ts:15,18`: dos `as unknown as` (interoperabilidad ESM/CJS de ajv-formats y registro de esquema `as const` en Ajv). No son sobre payloads, pero conviene acotarlos con comentario o tipado explícito.
- MINOR-4 `app/src/executions/executions.contract.spec.ts:17`: helper `load<T = Record<string, any>>` hace `JSON.parse(...) as T` (solo en test, entrada fija del repo; sin riesgo en producción). Además `TestCaseFactStatus`/`TestCaseFailureKind` (sandbox-execution.contract.ts:54,62) siguen escritos a mano, no derivados del contrato; riesgo de deriva futura, no cubierto por contracts:check.

## Blockers
Ninguno.

## recommendedNextStep
Cerrar ambos WI como DONE por el flujo normal (APPROVED sin BLOCKER ni MAJOR); tratar MINOR-1 (atar la excepción de 5 ciclos al id del WI) en un corte HARNESS posterior; el resto es opcional.
