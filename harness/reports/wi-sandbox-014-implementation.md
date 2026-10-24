Modelo: implementer · configurado claude-haiku-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-014 · Implementación

**Estado: IMPLEMENTED (pendiente de revisión independiente por `reviewer`).** No hay commit ni push.

## Cambios
1. `app/src/executions/execution-pipeline.service.ts`: nueva constante exportada `DEFAULT_MAX_CONCURRENT_EXECUTIONS = 2` (con comentario de razón: e2-medium 2 vCPU / 4 GB, contenedores de 1 GiB). El constructor la usa como default de `SANDBOX_MAX_CONCURRENT_EXECUTIONS` (antes `4`). Comentario de `withSlot` actualizado a «por defecto 2».
2. `app/.env.example`: `SANDBOX_MAX_CONCURRENT_EXECUTIONS=2` con comentario explicando el default y que la latencia en cola es diagnóstica.
3. `app/src/executions/execution-pipeline.service.spec.ts`: 2 pruebas nuevas:
   - Sin la variable, 3 ejecuciones bloqueadas en instalación: `load = {active: 2, waiting: 1}`, la 3.ª en `PENDING`; al liberar, las 3 quedan `COMPLETED` con `result.failure = null` y `failureCode = null`.
   - Override explícito `=3`: `load = {active: 3, waiting: 0}`; las 3 `COMPLETED`.
   - La prueba existente con override `=1` se mantiene.
4. `app/src/common/config/env.validation.spec.ts`: nueva prueba que rechaza `-1`, `1.5` y `abc` para `SANDBOX_MAX_CONCURRENT_EXECUTIONS` y acepta `2` y ausencia.

Sin cambios en `spec/`, `harness/` (salvo este reporte), `env.validation.ts` (solo lista la clave) ni en contratos.

## Resultados (comandos reales, desde `app/`, Node en PATH)
- `pnpm lint` (oxlint src/ test/): exit 0.
- `pnpm test`: exit 0. Test Files 34 passed | 1 skipped (35); Tests 309 passed | 4 skipped (313).
  - Las 4 pruebas tocadas pasan: «usa 2 huecos por defecto…», «acepta un override explícito de 3…», «limita las ejecuciones simultáneas…» (=1) y «SANDBOX_MAX_CONCURRENT_EXECUTIONS: rechaza -1, 1.5 y abc…». Ejecución dirigida: 44 passed en los 2 archivos.
- `pnpm build` (nest build): exit 0.
- `pnpm contracts:check`: exit 0 (sin diferencias).

## Notas
- El deadline no se ve afectado: `deadlineAt` se calcula tras adquirir el hueco (ver análisis SDD, hallazgo de deadline). No se añadió prueba específica de esa propiedad (era opcional en el análisis).
- Los 4 validadores de harness (`harness/validate-*.mjs`) no se ejecutaron: no estaban en la lista de comandos asignada.
- G-1 del análisis (aclaración en spec.md:29) no se aplicó: spec/ queda fuera del alcance del implementer.

## Archivos afectados
- app/src/executions/execution-pipeline.service.ts
- app/src/executions/execution-pipeline.service.spec.ts
- app/src/common/config/env.validation.spec.ts
- app/.env.example
- harness/reports/wi-sandbox-014-implementation.md (este reporte)
