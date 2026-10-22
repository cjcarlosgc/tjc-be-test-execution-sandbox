Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Regularización de eventos Contract Sync históricos de Core — 2026-10-18

Autorización: [TN]-Cross, decisión (2)=a, limitada a los 5 eventos del inbox que son de Core y cuyo contenido ya está aplicado en el espejo. Se hace dentro de WI-SANDBOX-010 (necesario para sus checkpoints). No se toca Core ni el contenido contractual de ningún evento. Ningún evento se reescribe salvo el primero, que solo recibe el campo faltante.

| Evento | Qué se hizo | Por qué |
| --- | --- | --- |
| `CS-CORE-20261011-002` (INTEROP-2.8, `projectRoot`) | Se añadió `sourceWorkItem: WI-CORE-037` (consta en el evento original del outbox de Core y en `wi-sandbox-001-contract-sync-acknowledgement.md`) y se resolvió. | El validador V3 exigía el campo para los IDs con namespace. El campo `projectRoot` ya lo implementó WI-SANDBOX-001 y el espejo INTEROP-2.17 lo incluye. |
| `CS-CORE-20261012-001` (DEC-INF-001, `scopePaths` de contratos) | Sin cambios. | No es relevante para este WI (`contractImpact: false`; su alcance son rutas `spec/contracts/`). Ya era válido. |
| `CS-CORE-20261012-002` (corrección de procedencia de CS-CORE-20261009-016) | Resuelto. | Informativo; sin cambio funcional ni contractual para Sandbox. |
| `CS-CORE-20261012-010` (SYSTEM/INTEROP-2.11 editorial, DEC-INF-002 PROPOSED) | Resuelto. | Informativo y reemplazado por `CS-CORE-20261012-012`. |
| `CS-CORE-20261012-012` (DEC-INF-002 as-built, límite de tasa y rotación de 90 días) | Resuelto. | El espejo `SYSTEM-2.13` ya recoge DEC-INF-002 as-built y DEC-INF-001 resuelta. La parte operativa (ratificar los valores del proxy y el procedimiento de rotación, propietario Jean; IAP como respaldo) es infraestructura externa: **no** se ejecuta ni se autoriza aquí y sigue documentada en `harness/reports/sandbox-tls-publication-runbook-proposal.md`. |

## Pendiente (PASO B, no se hace aquí)
Acuse formal de `CS-CORE-20261009-016`, revisión del mapa de HU del backlog y el WI de migración a SDD 3.1. Para el gate de este WI no fue imprescindible el acuse de `CS-CORE-20261009-016` (no está en el inbox local).
