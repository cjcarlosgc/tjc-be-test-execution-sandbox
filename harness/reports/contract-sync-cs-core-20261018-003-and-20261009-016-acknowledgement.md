Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Acuse de CS-CORE-20261009-016 y CS-CORE-20261018-003 — WI-SANDBOX-013

Ambos eventos se importaron desde el outbox de Core (solo esos dos; el resto del outbox no apunta a Sandbox o ya estaba en la bandeja) el 2026-10-18.

## CS-CORE-20261009-016 (WI-CORE-013, INTEROP-2.7, aditivo)
Origen: `CS-SANDBOX-20261009-001` (lo publicó este Sandbox). Contenido y estado en el Sandbox:
- `TestCaseFact.failureKind` ASSERTION|ERROR|null: ya lo emiten los parsers (`jest-compatible-result-parser.ts`, `phpunit-junit-result-parser.ts`).
- `GENERATED_TESTS` ejecuta solo los artefactos aplicados y `BASELINE` la suite configurada; `phase=BASELINE` con artifacts → 400 (`executions.service.ts` `assertPhase`); `phase` omitido = `GENERATED_TESTS` (tolerancia transitoria, `DEFAULT_EXECUTION_PHASE`); `phase` entra en la huella de idempotencia (`execution-fingerprint.ts`).
- Códigos `TEST_COMPILATION_FAILED`/COMPILATION e `IMAGE_UNAVAILABLE`/INFRASTRUCTURE: en `sandbox-fact-error.ts` y los parsers.
Acción para Sandbox: ninguna adicional; el espejo vigente (INTEROP-2.17) ya lo contiene. Se acusa por trazabilidad.

## CS-CORE-20261018-003 (WI-CORE-069, SYSTEM-2.13 / INTEROP-2.17 / GH-INTEROP-1.8 / esquemas)
- Espejo del Sandbox (solo SYSTEM e INTEROP; no espeja el contrato GH): `system-contract.md` sha256 `b70f9358…a0444` (coincide), `interoperability-contract.md` sha256 `b9ed40dc…a05` (re-espejado byte a byte desde Core; antes divergía en 2 líneas editoriales: §5 `pollAfterMs` opcional en el GET de estado y §10 validación en frontera), árbol `spec/contracts/schemas` sha256 `c45e4513…1b31` (coincide).
- Emitir `executionProfile` en `RunnerFacts` y un `stage` válido en la evidencia, y seguir aceptando requests sin `phase`: se verifica con pruebas de contrato sobre resultados reales del pipeline (ver el reporte de implementación de WI-SANDBOX-013).
- El GET de estado del Sandbox puede repetir `pollAfterMs` como sugerencia opcional (no figura en el esquema); Core la acota a 30 s. El Sandbox no la emite hoy; no hace falta cambio.
