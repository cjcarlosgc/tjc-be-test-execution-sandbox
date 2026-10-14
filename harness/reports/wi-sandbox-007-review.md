# Revisión independiente — WI-SANDBOX-007 (marcas ISO por etapa en StageDuration)

Fecha: 2026-10-14  
Veredicto: `APPROVED` (con una condición de proceso no bloqueante: emitir el CONTRACT_SYNC a Core).  
Reviewer: `reviewer`; revisión estática del working tree; sin build, sin Docker, sin tocar :3001.

## Verificaciones ejecutadas

- `pnpm -s lint`: sin errores. `tsc --noEmit -p tsconfig.build.json`: sin errores. `pnpm -s test`: 25 archivos, 203 passed, 2 skipped (ACL real, solo Linux/root).
- Diff revisado: `sandbox-execution.contract.ts`, `execution-pipeline.service.ts` (helper `stageTiming` y 3 `push`), su spec y `CHANGELOG.md`.

## Criterios

1. **Aditivo/retrocompatible: cumple.** `StageDuration` solo gana `startedAt?` y `completedAt?` opcionales; `stage` y `durationMs` quedan intactos. `stageTiming` calcula `completedAtMs` una sola vez y deriva `durationMs = completedAtMs - startedAtMs` y ambas marcas del mismo par de enteros, de modo que `completedAt - startedAt === durationMs` exactamente (el spec lo verifica y comprueba orden entre etapas). La respuesta HTTP reenvía `record.result.stageDurations` tal cual (`executions.service.ts:150`), sin mapeo por lista blanca que oculte o rompa campos.
2. **Sin datos sensibles ni cambios de aislamiento/auth/idempotencia: cumple.** Solo instantes ISO de etapas; no se tocan red, capabilities, montajes, auth, rutas ni códigos. `stageDurations` es parte del resultado y no interviene en el fingerprint de idempotencia ni en la aceptación/replay.
3. **Sin contradicción con INTEROP-2.8 §7.3: cumple.** El campo es opcional y el contrato (§1) establece que los consumidores ignoran campos de respuesta desconocidos. El espejo `interoperability-contract.md` (interface `StageDuration`, línea ~1415) aún no lista los campos, por diseño: la copia canónica es de Core y el CHANGELOG indica que no se edita el espejo del Sandbox.
4. **ACL y FINALIZING sin alterar: cumple.** `recoverPhpWorkspaceAccess` no se mide ni agrega a `stageDurations`; FINALIZING sigue sin entrada propia; el orden de transiciones y el manejo de `TEST_TIMEOUT`/OOM no cambia (el `push` ocurre en el mismo punto que antes).

## Observaciones no bloqueantes

- Proceso: el CHANGELOG declara que se notifica por `CONTRACT_SYNC`, pero el diff no incluye el mensaje saliente ni actualización de `harness/state.json`; emitirlo y registrarlo antes del commit para que Core incorpore los campos en el espejo y evitar deriva código-vs-contrato.
- Estética: la nueva función `stageTiming` y su JSDoc quedaron entre el comentario de clase y `@Injectable()`, separando el JSDoc original del pipeline de su clase; moverla encima del bloque o debajo de las constantes.
- Preexistente: `Date.now()` no es monótono; un retroceso de reloj podría dar `durationMs` negativo (igual que antes); no introducido por este cambio.
- El spec cubre solo el camino feliz PHP/Node de tres etapas; sería útil una aserción para una etapa fallida (p. ej. instalación con error), que también hace `push` con marcas.

## Resultado

`APPROVED`. Sin hallazgos bloqueantes; cierre sujeto a registrar el Contract Sync a Core y a la regla habitual de commit con `Refs: HU11`.
