# CONTRACT_SYNC protocol

`CONTRACT_SYNC` es notificación persistente, no API remota: nunca autoriza modificar Core. JSON versionado permite comprobar exactamente los campos entre sesiones. Cada evento contiene `id` (`CS-...`), `source` (`core|sandbox`), `targets`, `changedContractAreas`, `requiredActions`, `sourceRevision`, `status` y `createdAt`. Las áreas válidas son `executions`, `dto`, `phase`, `executionProfile`, `auth`, `headers`, `idempotency`, `statuses`, `evidence`.

Publicar solo deja una notificación de cambio contractual Sandbox ya aprobado en el outbox:

```sh
node harness/contract-sync.mjs publish --id CS-SANDBOX-001 --targets core --areas executions,dto --actions 'review INTEROP-2.2' --source-revision <commit>
```

Un mensaje recibido de Core se importa explícitamente —el PULL duradero— y luego se comprueba:

```sh
node harness/contract-sync.mjs import --file /absolute/path/CS-CORE-001.json
node harness/contract-sync.mjs check --checkpoint start --work-item T-002-harness-v2
```

Ejecutar check en `start`, `before-implementation-delivery`, `before-review` y `before-done`. Un PENDING relevante dirigido a Sandbox sale con código 2, se registra en `pendingRelevantSyncIds` y exige contract-reviewer. Nunca borrar eventos: después de evidencia concreta, registrar su recepción/resolución:

```sh
node harness/contract-sync.mjs acknowledge --id CS-CORE-001 --status ACKNOWLEDGED --evidence harness/reports/contract-review.md
```

`RESOLVED` se reserva para cambio contractual efectivamente resuelto. Ambos estados dejan el historial intacto y no reescriben el contrato canónico de Core.
