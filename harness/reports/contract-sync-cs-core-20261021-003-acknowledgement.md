Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Acuse de CS-CORE-20261021-003 — WI-SANDBOX-015

Evento de Core (WI-CORE-074, `sourceRevision 5c82853c…`), INTEROP-2.18, `breaking: false` para el Sandbox: añade §4.1 (12 códigos genéricos de error, sin cambio para el Sandbox, cuyos nombres ya coinciden), realtime/Socket.IO (no aplica al Sandbox) y el esquema abierto del `code` del `ErrorEnvelope`. `sandbox-execution.schema.json` no cambió. Acción: re-espejar `interoperability-contract.md` y `spec/contracts/schemas/` byte a byte (SYSTEM-2.13 sin cambio; no se espeja el contrato GH aunque `scopePaths` lo liste), regenerar tipos y reejecutar los contract tests. Sin cambio de código de producción esperado.
