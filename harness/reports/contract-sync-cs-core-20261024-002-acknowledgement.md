Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Acuse de CS-CORE-20261024-002 — WI-SANDBOX-020

Evento de Core (WI-CORE-079, `sourceRevision 208c3bdf…`), `breaking: false`, documental: SYSTEM-2.15 / INTEROP-2.20, nuevo esquema canónico CT-01 `github-webhook-event.schema.json` (Integration→Core) con 15 ejemplos, E-01 (`targetId` en `ExperimentResultsResponse`, Core↔Console), frase neutral en SYSTEM y corrección del ejemplo `sandbox-result.failed.json` (`DEPENDENCY_INSTALL_FAILED`). Para el Sandbox: re-espejar `system-contract.md`, `interoperability-contract.md` y `spec/contracts/schemas/` byte a byte (no el contrato GH), regenerar tipos y verificar la coherencia del ejemplo corregido con `sandbox-fact-error.ts`. Sin cambio de lógica.
