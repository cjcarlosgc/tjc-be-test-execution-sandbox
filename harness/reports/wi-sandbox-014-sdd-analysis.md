Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-014 · Análisis SDD

**Veredicto: SPEC_VERIFIED** (un ajuste menor opcional de spec, ver G-1).

## Suficiencia de la spec
- spec/features/008-reliability-lifecycle/spec.md:29 («Concurrencia») ya declara default 2, razón (e2-medium, ADR-10, contenedores 1 GiB), «solo cambia espera, no contrato HTTP» y latencia en cola como medida diagnóstica, no de calidad (tesis 3.3). Cubre el 2.º criterio de aceptación (work-items.json:193).
- spec.md:53: `PENDING` espera un hueco de concurrencia (ya documentado).
- CHANGELOG.md:9: entrada WI-SANDBOX-014 presente.
- tasks.md:4: ST-SANDBOX-014 T-READY.

## Contrato HTTP
- spec/contracts/interoperability-contract.md:80 define `429` como «límite de solicitudes/concurrencia» (regla genérica). El Sandbox NO lo emite por concurrencia: `app/src/common/http/http-exception.filter.ts:22` solo mapea el código; `withSlot` (execution-pipeline.service.ts:~124-139) encola con promesa y la ejecución queda `PENDING`. No hay otra referencia a 429 en app/src. Sin cambio de contrato (contractImpact=false correcto). `git diff` en spec/contracts: vacío.
- DEC pendientes con Blocks: ninguna en harness/state.json (grep sin resultados).

## Deadline (hallazgo)
- `deadlineAt = Date.now() + executionDeadlineMs` se calcula en `execute()` (execution-pipeline.service.ts:149), DESPUÉS de adquirir el hueco (`run` -> `withSlot` -> `execute`, líneas ~103-107) y de pasar a `PREPARING` (línea 146). **La espera en PENDING NO consume SANDBOX_EXECUTION_DEADLINE_MS (default 600000, .env.example:24).** No hay riesgo de agotar el deadline por cola larga con tope 2, y la espera no es fallo.
- G-1 (menor, riesgo residual fuera de alcance): una cola larga sí aumenta la latencia percibida por Core (su sondeo/timeout propio) y la cola no tiene cota de admisión (backlog I-SANDBOX-005, spec/backlog.md:105). Propuesta: no cambiar nada ahora; opcionalmente una línea en spec.md:29 que diga «el deadline global se mide desde que la ejecución obtiene el hueco; la espera en cola no lo consume».

## Cambios exactos (implementer)
1. app/src/executions/execution-pipeline.service.ts:97: `..., 'SANDBOX_MAX_CONCURRENT_EXECUTIONS', 4)` -> `2`.
2. app/src/executions/execution-pipeline.service.ts:120: comentario «por defecto 4» -> «por defecto 2».
3. app/.env.example:50: `SANDBOX_MAX_CONCURRENT_EXECUTIONS=4` -> `=2` (opcional: comentario con la razón e2-medium).
4. app/src/common/config/env.validation.ts:14 solo lista la clave; sin cambio de código (el default no vive allí).
5. No hay README/docs de app que mencionen el tope (git grep sin resultados); no hay pruebas que asuman 4 (env.validation.spec.ts:7 usa '2' como valor explícito; pipeline spec:261 fija 1).
6. spec/CHANGELOG ya editados por el leader. plan.md de 008 no menciona concurrencia: sin cambio requerido.

## Pruebas que deben existir
- (nueva) execution-pipeline.service.spec.ts: sin `SANDBOX_MAX_CONCURRENT_EXECUTIONS` (configOverrides vacío) con 3 ejecuciones y puerta en installDependencies: `pipeline.load` = `{active: 2, waiting: 1}` y la 3.ª en `PENDING` -> demuestra default efectivo 2 y cola con el default.
- (existente, spec:~257) override por entorno =1 -> `{active:1, waiting:1}`; mantener. Opcional: override =3.
- (nueva, en la misma prueba) al liberar, las 3 terminan `COMPLETED` (la espera no cuenta como fallo, sin failure ni TIMED_OUT) y `load` vuelve a `{0,0}`.
- (existente) env.validation.spec.ts:25 rechaza '0'; añadir caso '-1' y '1.5' / no numérico para la clave, y que `{}` y '2' pasan (líneas 6-7).
- (opcional) prueba de que el deadline no cuenta la espera: con executionDeadlineMs pequeño y la 2.ª en cola más tiempo que el deadline, la 2.ª no falla con EXECUTION_DEADLINE_EXCEEDED por haber esperado.

## Verificación final
lint, pruebas, build, `contracts:check` y los 4 validadores (work-items.json:194).
