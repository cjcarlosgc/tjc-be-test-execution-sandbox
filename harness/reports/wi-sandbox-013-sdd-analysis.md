Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-013 — Análisis SDD

Veredicto: **SPEC_GAPS** (la spec es suficiente para implementar; falta la prueba que cierra la requiredAction de CS-CORE-20261018-003 y la evidencia CT-06/CT-07). Ningún hueco de contrato; todos son de pruebas y dos editoriales menores.

## 1. Espejo (verificado con shasum)
- system-contract.md: b70f9358…0444, idéntico a Core. interoperability-contract.md: b9ed40dc…ea05, idéntico. Árbol de esquemas: c45e4513…1b31 en ambos; `diff -r` sin diferencias. Cumple.
- `app/src/contracts/generated/contract-types.ts:51` ya trae `retryable?`, `:143/:225` `executionProfile`, `:148` `phase?`, `:238-258` `stage`.

## 2. Eventos
- CS-CORE-20261018-003 (C-ACKNOWLEDGED): exige re-espejar (hecho), emitir `executionProfile` en RunnerFacts, `stage` válido en evidencia, aceptar requests sin `phase`, y correr contracts:check/lint/build/test.
  - Cumplimiento en código: `executionProfile` lo fijan los parsers (`runner-adapters/jest-compatible-result-parser.ts:43,89`, `phpunit-junit-result-parser.ts:72`); evidencia con `stage: currentStage` (`executions/execution-pipeline.service.ts:293-306,340-347`); `phase ?? DEFAULT_EXECUTION_PHASE` (`executions.service.ts:85`), `assertPhase` (`:204`).
  - Prueba: sin sesgo de inyección solo parcial. `executions.contract.spec.ts:62` prueba request sin phase (correcto, real vía HTTP). Pero `:76-90` (result) copia `example.facts/evidence` al repositorio con `Object.assign`: no demuestra emisión real. `execution-pipeline.service.spec.ts` ejecuta el pipeline real (`:293-299`, `:358` verifica executionProfile PHP) pero no valida contra el esquema ni asserta `evidence[].stage`; no importa `validateContract`. **Falta la prueba.** El acuse (`harness/reports/contract-sync-cs-core-20261018-003-and-20261009-016-acknowledgement.md`) remite al reporte de implementación, aún inexistente.
- CS-CORE-20261009-016 (target console+sandbox): failureKind, phase BASELINE+artifacts→400, default phase, phase en huella, códigos nuevos: ya implementados (acuse lo respalda: parsers, `assertPhase`, `execution-fingerprint.ts`). Falta comprobar con prueba los 400 y la huella (ver T5/T6; probablemente ya existen en executions.service.spec.ts:225+; el implementer debe confirmar, no duplicar).
- CS-CORE-20261012-001: solo DEC-INF-001 operativa (reusar VM, WI local, identificar SHA desplegado); sin cambio de código. Ya acusado (wi-sandbox-003-contract-sync-preflight.md). Nada falta para WI-013.

## 3. `retryable?`
INTEROP-2.17 §4 (línea 66): opcional, «lo declaran los servicios cuyo contrato distingue reintentos (GH-INTEROP)»; línea 70 dice que Core, Sandbox y GH devuelven «esta misma forma completa» y que GH lo agrega en todos sus errores. Sandbox NO debe emitirlo: es opcional y el contrato de Sandbox no distingue reintentos. Hoy no lo emite (sin coincidencias en app/src fuera de lo generado). Hay una ambigüedad editorial («misma forma» vs opcional): recomiendo que el implementer lo anote en el reporte como decisión «no emitir, sí aceptar»; no se edita el espejo. Prueba opcional T7 (el esquema lo admite, el filtro de excepciones no lo agrega).

## 4. Mapa de HU
- Catálogo: las 18 filas HU01–HU18 son idénticas a Core (`diff` solo muestra secciones propias de Sandbox: participación y mapa). Coinciden con la tesis (tabla ~1263-1290; HU11 aislado sin credenciales, HU12 evidencia, HU13 discrepancias, HU17 comparación con mismo Sandbox). Descripciones correctas.
- Participación HU11/12/13/17: correcta. HU13 bien acotada (hechos, clasificación de Core).
- Mapeo antiguo→vigente verificado contra `spec/legacy/backlog-sdd-2.1.md`: HU08–12 generar → HU11 (el legado las llama «generar pruebas»; vigente HU10 es generación y HU11 validación: el mapa dice «Sandbox solo valida», aceptable pero HU10 sería el destino literal; solo nota), HU14→HU12, HU19→HU17, HU23 y HU46 descartadas, HU24→HU11 (reintento de Core; el Sandbox no lo hace), HU43 y HU47→HU11. Aceptable como propuesta; sin error.
- Referencias a HU antiguas: ninguna sin marcar en features/transversal/constitution/README. Las encontradas son HU11/12/17 vigentes; los spec.md llevan la nota «HU antiguas… Mapa histórico». Menor: `spec/features/001-execution-api/tasks.md:7` ST-SANDBOX-009 mantiene HU11 correcto.
- Nota: Core no tiene sección «Participación de Sandbox»; es propia de este repo (válido).

## 5. C-06 / C-07 ↔ pruebas
- C-06 (enviar job): cubierto por `executions.contract.spec.ts:51` (202, request canónico node/php), `:62` sin phase, errores 400/401/404 (`:92-117`). Falta: perfil no soportado → 400 con envelope (si no existe en executions.service.spec.ts, añadir) y «sin secretos»: el request rechaza campos no declarados (`:95`), suficiente.
- C-07 (devolver hechos): cubierto solo con inyección (`:76`). Falta resultado REAL: COMPLETED con tests, fallo de test (TEST_FAILED/failureKind), timeout y error de infraestructura, validados con el esquema.

## Pruebas que debe añadir el implementer (preferible `executions.contract.spec.ts` o spec nuevo `executions.pipeline-contract.spec.ts`, usando ExecutionPipelineService real con ejecutor/runner de contenedor falso o fixtures de salida cruda de Jest/JUnit, NO ejemplos de resultados)
1. T1 `result real NODE cumple SandboxExecutionResultResponse`: correr pipeline sobre fixture Jest, leer `/executions/{id}/result` por HTTP; `validateContract('sandbox-execution.schema.json','SandboxExecutionResultResponse')` sin errores y `facts.executionProfile==='NODE_TYPESCRIPT'`.
2. T2 igual para PHPUnit (JUnit): `executionProfile==='PHP_LARAVEL_PHPUNIT'`.
3. T3 `evidence[].stage` válido: cada item de `evidence` tiene `stage` dentro de SandboxStage (enum del esquema) y, para el flujo normal, `RUNNING_TESTS`; incluye TEST_STDOUT, TEST_STDERR y RUNNER_REPORT.
4. T4 `request sin phase de extremo a extremo`: POST sin phase, esperar fin, `GET /executions/{id}` y el result real validan; `phase` efectivo `GENERATED_TESTS`.
5. T5 `phase=BASELINE con artifacts → 400` con ErrorEnvelope válido (si falta).
6. T6 `phase entra en la huella`: misma carga con phase distinta no reutiliza idempotencia.
7. T7 `fallo de test real`: failure TEST_ASSERTION/TEST_FAILED, `failureKind` ASSERTION vs ERROR en `facts.tests`, resultado válido contra esquema.
8. T8 `timeout e infraestructura` (IMAGE_UNAVAILABLE/INFRASTRUCTURE, TEST_COMPILATION_FAILED/COMPILATION): resultado válido y `failure.stage` correcto (CT-07).
9. T9 `perfil no soportado → 400` (C-06) con envelope.
10. T10 `retryable` (opcional): envelope de errores del Sandbox válido sin `retryable`.
Ejecutar además `npm run contracts:check`, lint, build, test.

## Texto propuesto (huecos)
- Para el reporte de implementación: «Sandbox no emite `retryable` (INTEROP-2.17 §4: opcional, definido por GH-INTEROP); los consumidores lo ignoran si falta. `pollAfterMs` tampoco se emite (no está en el esquema; Core lo acota a 30 s).»
- Para `spec/backlog.md` (mapa), nota opcional: «HU08–HU12 (generar pruebas) → HU10 (generación, Core) y HU11 (validación, Sandbox); el Sandbox solo participa en HU11.»

## DEC con Blocks
Ninguna DEC con Blocks aplica a WI-SANDBOX-013 (DEC-INF-001/002 son de infraestructura, no bloquean este WI). Confirmado por lectura de CS-CORE-20261012-001 y del acuse; no se auditó el registro DEC completo línea a línea.

## Resumen
status SPEC_GAPS · blockers ninguno · recommendedNextStep: implementar T1–T10 (T1–T4 imprescindibles) y emitir reporte de implementación que cierre el acuse.

## Cierre del leader
Los huecos son de pruebas, no de spec: el implementer añade T1–T10 y el reporte de implementación. Veredicto tras el cierre: **SPEC_VERIFIED** (`contractImpact: true` por el espejo; sin decisión bloqueante). `retryable?` y `pollAfterMs` no se emiten y se toleran si llegan.
