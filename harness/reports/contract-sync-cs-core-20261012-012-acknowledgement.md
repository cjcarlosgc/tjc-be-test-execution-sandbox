# CONTRACT_SYNC CS-CORE-20261012-012 — acuse

Fecha: 2026-10-12. Resultado: `ACKNOWLEDGED`. Sin cambio en código, contratos ejecutables (`INTEROP-2.8` vigente) ni en la VM; el Sandbox no ejecuta cambios operativos con este acuse.

## Qué es

Core (WI-CORE-049, `sourceRevision` `864aa837b95fa379cc2c6d0a98f37521ff3eb3b6`) publica SYSTEM-2.12/INTEROP-2.12: `DEC-INF-002` aprobada as-built (HTTPS con TLS y bearer tras un proxy en la VM; SSH solo IAP; rate limit con valores iniciales por ratificar; rotación de 90 días; IAP como respaldo). Reemplaza a `CS-CORE-20261012-010`. Sin cambios de rutas, campos, códigos ni transporte. La confirmación de Jean proviene de Core/Cross; el Sandbox no la verificó.

## Importación

Evento YAML traducido a `harness/contract-sync/inbox/CS-CORE-20261012-012.json` (como -002/-010); `changedContractAreas: [executions]` es un valor impuesto por el esquema; YAML original intacto en `sourceEventYaml`; `supersedes: [CS-CORE-20261012-010]`.

## Respuesta a la acción requerida

Se ratifican **los valores de Cross**, no los iniciales de Core. Documentado en `harness/reports/sandbox-tls-publication-runbook-proposal.md`:

| Control | Valor propuesto por Core | Valor ratificado (Cross) |
|---|---|---|
| `POST /executions` por IP | 20/min | **60/min** |
| `POST /executions` global | 30/min | **sin tope global** |
| `GET /executions/*` y `/result` por IP | 240/min | **600/min** |
| Sin bearer válido | 10/min | **10/min por IP, solo cabecera ausente** (el proxy no valida el token) |
| Body | — | 5MB |

Motivo: Core trata un `429` del proxy como `SandboxUnavailable`; un tope bajo o global estrangularía los experimentos y sesgaría métricas. Los valores son iniciales y se ajustan tras observar PRs reales y la evidencia de experimentos. Rotación de 90 días y reversión a IAP-only: ver el runbook (dueño: Jean). El tunnel IAP se conserva como respaldo. **No se tocó VM, firewall ni proxy.**
