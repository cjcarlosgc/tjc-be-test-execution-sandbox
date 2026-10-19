Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Vía rápida — WI-SANDBOX-009 (test con el cliente real de Core)

Alcance aprobado por el usuario en el chat del Sandbox el 2026-10-19, a pedido de cross. Spec verificada por el leader (vía rápida): solo se añade un test; no hay cambio de comportamiento ni de contrato (`contractImpact: false`). Verificación previa de viabilidad: un spike descartado confirmó que `SandboxExecutionService` de Core se importa desde el vitest del Sandbox y se instancia con `ConfigService` y `ObjectStorageService` simulados, sin tocar Core ni añadir dependencias. Core ya implementa Bearer e identidad `requestId` UUID v5 (`sandbox-request-id.util.ts`).
