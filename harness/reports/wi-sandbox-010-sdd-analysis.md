Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-010 — Análisis SDD (persistencia del estado de ejecuciones)

Veredicto: **SPEC_GAPS** (no SPEC_VERIFIED). Sin bloqueos de contrato ni de decisiones; 4 huecos de redacción que hay que cerrar en `008/spec.md` antes de implementar. Ninguno exige cambiar `spec/contracts`.

## 1. Contrato HTTP: no se contradice ni cambia

- `failure.code` es string libre: `sandbox-execution.schema.json:128` (`{"type":"string","minLength":1}`); `failureCode` en el status es `string|null` sin enum (`:75`). `SANDBOX_RESTARTED` no necesita alta en el esquema.
- `category: INFRASTRUCTURE` ya está en el enum (`:127`). `stage` admite `PREPARING` y las demás etapas.
- INTEROP `:82`: un fallo posterior al `202` es resultado persistido de la ejecución, no un 5xx. Un `FAILED` por reinicio encaja.
- `EXECUTION_NOT_FOUND → 404` (`interoperability-contract.md:1500`) sigue vigente para ids inexistentes o expulsados por retención. Que ya no ocurra para lo persistido no altera el contrato.
- Ni SYSTEM-2.13 ni INTEROP-2.17 afirman que el Sandbox «no persiste» (búsqueda sin resultados). La afirmación vive solo en comentarios y config desactualizados que el WI debe corregir: `app/src/executions/execution.repository.ts:28` y `app/.env.example:52-53` («Tras un reinicio se pierden y Core recibe 404»).
- Conclusión: `contractImpact:false` es correcto. No hace falta `contract-reviewer`.

## 2. Huecos que impedirían implementar o probar

H1 (el más importante). `GET /result` de un registro `FAILED` restaurado desde `PENDING`.
- `executions.service.ts:126` exige `result` no nulo y `:134` exige `startedAt` y `completedAt` no nulos, si no responde 409 `EXECUTION_NOT_FINISHED`.
- Un `PENDING` restaurado tiene `startedAt=null` (`executions.service.ts:92`, `execution-pipeline.service.ts:131` lo asigna solo al ejecutar) y `result=null`.
- El esquema de resultado exige `startedAt`/`completedAt` ISO no nulos y `facts/failure/stageDurations/appliedArtifactIds/evidence` presentes (`schema:145-156`).
- La spec dice solo «se marca FAILED... y se reescribe» (`spec.md:28`). No define el contenido de `result` ni los tiempos.
- Propuesta de texto para `spec.md:28`: «Al marcar `SANDBOX_RESTARTED`, el servicio fija `completedAt = updatedAt = instante de recarga` y `startedAt = startedAt previo ?? createdAt` (nunca null), `failureCode = 'SANDBOX_RESTARTED'`, `failureMessage` fijo y genérico (`el Sandbox se reinició durante la ejecución`), y `result = { facts: null, failure: { stage, category: 'INFRASTRUCTURE', code: 'SANDBOX_RESTARTED', message }, stageDurations: [], appliedArtifactIds: [], evidence: [] }`. Así `GET /result` responde 200 y no 409.» Se pierden la evidencia y las duraciones parciales, porque nunca se persisten en curso (ver H4).

H2. Alcance de «registro terminal restaurado». `spec.md:42` dice que `snapshot`, `artifacts` y `projectRoot` no existen en un registro restaurado, pero `ExecutionRecord` (`domain/execution-record.ts:20-22`) los declara obligatorios.
- Propuesta: «El registro restaurado materializa `snapshot`, `artifacts: []`, `projectRoot: '.'` con valores inertes, o el tipo los marca opcionales; ningún camino de lectura los usa en estado terminal. Una prueba verifica que `getStatus`/`getResult`/replay no los leen.»

H3. Replay de idempotencia contra un registro restaurado.
- La huella excluye `url` y `expiresAt` (`execution-fingerprint.ts:9-14`; INTEROP §7.2), así que el replay con URL nueva coincide. Es coherente con `spec.md:40`.
- Falta un criterio de prueba explícito: el replay equivalente tras reinicio devuelve el mismo `executionId` sin lanzar pipeline, y el replay con cuerpo distinto devuelve 409 `IDEMPOTENCY_CONFLICT`.
- Además `toAcceptedResponse` (`executions.service.ts:232`) siempre responde `status:'PENDING'` aunque el registro sea terminal. Es el comportamiento vigente (aceptación original) y debe quedar declarado como se mantiene.

H4. Cuándo se escribe y qué es «en curso».
- Las transiciones intermedias pasan por `repository.save` (`execution-pipeline.service.ts:~470-475`). La spec no dice si se persiste cada transición o solo la creación y el estado terminal.
- Propuesta: «Se persiste en `create` (PENDING) y en cada `save`, incluidas las transiciones. La evidencia se escribe solo con el estado terminal (el pipeline la acumula en memoria hasta el `save` final, `:363,387`).» Es suficiente para el criterio de recarga como `FAILED`.

H5 (menor). Falta un tope y política de lectura del archivo. Propuesta: tamaño máximo por archivo (p. ej. 1 MiB, el máximo teórico es ~5 evidencias × 8 KiB `MAX_EVIDENCE_BYTES`, `pipeline:51`, más hechos de casos) y validación de forma con `executionId` del nombre igual al del contenido. También: el `executionId` del nombre de archivo debe ser un UUID (prevención de path traversal al construir la ruta; el id solo lo genera `randomUUID`, `service:74`, pero al recargar se lee del nombre).

## 3. Seguridad de lo que se escribe a disco

- `snapshot` y `artifacts[].download` (URLs firmadas) quedan fuera por la lista blanca (`spec.md:40`). Bien.
- Riesgo residual: `failureMessage` y `result.failure.message` y `evidence[].content`. Provienen de stderr/stdout del runner y del report (`pipeline:293-345`, `:547-566`), truncados a 500 B o 8 KiB, pero sin saneado.
  - Pueden contener rutas del workspace (`/workspace/...`), nombres de archivo del proyecto y, en teoría, secretos impresos por tests del repositorio analizado.
  - `InvalidArtifactPathError` incluye `artifact.relativePath` (`:529-531`). Es una ruta relativa del repositorio, aceptable.
  - Los mensajes de descarga usan hostname de redirección, no la URL firmada (`execution-input-download.service.ts:152`), y `InputUrlExpiredError` es genérico (`download-policy.ts:43`). No se ve fuga de la URL firmada en mensajes.
- Esa misma información ya se devuelve a Core por HTTP (`/result`), así que persistirla no amplía lo que el contrato expone. Sí amplía la superficie en reposo.
- Controles ya previstos y suficientes: directorio `0700`, archivos `0600`, directorio fuera de `tmpdir` y nunca desde el request, retención 24 h / 500.
- Propuesta a añadir a `spec.md:40`: «La evidencia y los mensajes persistidos son los mismos ya acotados que se devuelven por HTTP; no se amplía su contenido ni se persiste stdout/stderr no acotado. El directorio puede contener salida de tests de código del cliente: se trata como dato sensible, con permisos `0700/0600` y sin incluirse en backups ni logs.»
- Prueba exigida por el criterio 2 del WI: afirmar que el JSON no contiene `url`, `expiresAt`, `snapshot`, `download`, `projectRoot` ni el prefijo de la ruta del workspace, usando una ejecución con URL firmada de sentinel. El aserto sobre «rutas» solo cubre `projectRoot` y la ruta del workspace del host, no el contenido del runner; conviene redactarlo así en el criterio para que no sea inverificable.
- Escritura atómica: temp en el mismo directorio y `rename`; el hueco de `fsync` es aceptable para el piloto (declararlo).

## 4. Decisiones DEC

- Ninguna decisión `PENDING` con `Blocks` alcanza este WI. Todas las `Blocks` que revisé en `system-contract.md` son `NONE`, salvo `:305` (ingestión/despliegue con código empresarial y evidencia empresarial). No aplica: este WI es un cambio interno del Sandbox.
- `DEC-INF-001/002` (VM, snapshots de disco 14 días, `system-contract.md:269,281`) son relevantes como nota. El directorio de estado en el disco persistente de la VM queda cubierto por la misma política de retención de snapshots que ya acepta el código clonado. No bloquea; conviene mencionarlo en el runbook.
- `decisionGate`: pasa. Sin pregunta al leader.

## Resumen para el leader

- Cerrar H1–H5 en `spec/features/008-reliability-lifecycle/spec.md` (H1 es obligatorio; H2–H4 necesarios para pruebas sin ambigüedad; H5 menor).
- Corregir en la implementación los textos obsoletos de `execution.repository.ts:28` y `.env.example:52-53`.
- Sin impacto contractual: no activar `contract-reviewer`.

Handoff
- status: SPEC_GAPS (huecos de redacción, sin bloqueos de decisión ni contrato)
- filesAffected (a editar por el leader): `spec/features/008-reliability-lifecycle/spec.md`; luego implementación en `app/src/executions/execution.repository.ts`, `executions.module.ts`, `domain/execution-record.ts`, `common/config/env.validation.ts`, `app/.env.example`.
- recommendedNextStep: el leader incorpora el texto de H1–H5 a `spec.md` y avanza a implementación; el `sdd-analyst` puede reverificar rápido.

## Cierre del leader (2026-10-18)

Los huecos H1–H5 se incorporaron a `spec/features/008-reliability-lifecycle/spec.md` («Registros restaurados», «Contenido de un registro marcado SANDBOX_RESTARTED», «Idempotencia tras reinicio», «Cuándo se escribe», «Defensas en la recarga», «Residual aceptado»). Veredicto tras el cierre: **SPEC_VERIFIED**. `contractImpact: false` confirmado; sin decisiones bloqueantes.
