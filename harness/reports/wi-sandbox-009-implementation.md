Modelo: implementer-high · configurado claude-haiku-5-5 · atendido unknown · esfuerzo high

# WI-SANDBOX-009 · Test contra el cliente HTTP real de Core (CT-06 / CT-07)

Estado: **implementado; gate de pruebas en rojo por un fallo previo ajeno al WI** (ver «Bloqueo»). Sin commit ni push. `harness/state.json` y `harness/work-items.json` no se han tocado.

## Diseño

- **Montaje compartido** `app/test/support/contract-real-sandbox.ts`. Contiene el montaje que antes vivía en `executions.contract-real.spec.ts`: Nest real con `BearerAuthGuard`, `HttpExceptionFilter`, `ValidationPipe`, `ExecutionsService`, `ExecutionPipelineService` real, materializador, extractor, workspace real salvo creación/limpieza, adapters Jest/Vitest/PHPUnit y fixtures reales de runner. Los fakes quedan solo en los bordes (contenedor, descargas y directorios de workspace).
  - Opciones nuevas, todas opcionales: `listen` (`app.listen(0, '127.0.0.1')`, expone `sandbox.url`), `env`, `repository` y `verifyDownloads`. Con `verifyDownloads` el borde de descargas aplica la política real (`assertDownloadPolicy`, host de `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`, https, sin caducar) y verifica sha256/sizeBytes de lo que Core declara.
  - `ContainerScript.onInstall` se invoca al entrar en la instalación. Sirve para reiniciar con la ejecución parada en instalación.
  - Cambio de comportamiento del borde: `downloadToFile` devuelve el sha256 real en lugar de `'x'`. Los 16 tests existentes siguen pasando.
- **Refactor del spec existente** `executions.contract-real.spec.ts`: solo cambian los imports y la cabecera. El helper se mueve a `test/support`. Los cuerpos de los 16 tests no cambian y pasan (16/16).
- **Spec nuevo** `app/src/executions/core-client.contract.spec.ts`:
  - Core se carga con `import()` dinámico de una URL `file://` construida desde `__dirname`, dentro de `beforeAll`. Así la ausencia de Core no rompe la carga del archivo.
  - `SandboxExecutionService` se instancia con un `ConfigService` falso (`SANDBOX_URL` apunta al Sandbox real en `127.0.0.1:<puerto>`, token Bearer igual al del Sandbox) y un `ObjectStorageService` simulado.
  - El `ObjectStorageService` simulado guarda los bytes y devuelve URLs `https://storage.example.test/<key>?sig=EXAMPLE` que el Sandbox sirve. El host está en `SANDBOX_ALLOWED_DOWNLOAD_HOSTS`.
  - Un wrapper de `fetch` (solo registra, y en el caso de fallo redirige) permite observar las peticiones reales de Core.
  - Para la aserción de «sin advertencias de contrato» se espía el logger de la instancia de Core (`warn`) y se filtran los avisos `Contrato Core↔Sandbox`.
  - Los `describe` se llaman exactamente «CT-06 Core (cliente real) → Sandbox» y «CT-07 Sandbox → Core (cliente real)» y usan `describe.skipIf(!CORE_AVAILABLE)`. `CORE_AVAILABLE` es `existsSync` sobre `../../../../tjc-be-rag-core-api/app/src/sandbox/sandbox-execution.service.ts`.
  - Si Core no existe, un test «AVISO (no es una prueba)» con `it.skipIf(CORE_AVAILABLE)` emite el `console.warn`. Vitest no muestra la consola de un archivo totalmente omitido, por eso el aviso va en un test. Con `--reporter=verbose` se ve la línea.

## Casos

### CT-06 Core (cliente real) → Sandbox · caso feliz
1. Core llama `execute()` con un artefacto Vitest y un snapshot. El cuerpo POST valida contra `CreateSandboxExecutionRequest`. La cabecera `Authorization` es el Bearer esperado y `Idempotency-Key` es igual a `requestId`.
2. `requestId` es un UUID v5, generado por la función real `sandboxGenerationRequestId` de Core. Es estable: la misma entrada da el mismo valor, y `outcome.requestId` coincide.
3. El Sandbox acepta (202), Core sondea hasta terminal y lee el resultado. El resultado es `COMPLETED` con `executionProfile = NODE_TYPESCRIPT` y `facts` coherentes (`totalTests = passed + failed + skipped`, `suitePath` relativos `src/math.test.js`). Cada `evidence[].stage` es un `SandboxStage` válido.
4. `mapSandboxResult` de Core devuelve `VALID`.
5. Las respuestas de estado y resultado del Sandbox validan contra el esquema canónico.
6. Core no emite ningún aviso `Contrato Core↔Sandbox`.

### CT-07 Sandbox → Core (cliente real) · fallo terminal, decisión (a)
Se eligió la opción **(a) SANDBOX_RESTARTED**. Motivo: es el camino de reinicio real del Sandbox (`FileExecutionRepository.onModuleInit` → `markInterruptedAsRestarted`), y el fallo lo ve el cliente de Core sin tocar su API. Se descartó (b) timeout porque no ejercita el reinicio. El fallback del enunciado (IMAGE_UNAVAILABLE) no hacía falta.

Flujo:
1. Una instancia A persiste en `FileExecutionRepository(stateDir)`. Su instalación nunca termina (`gate` sin resolver), así que la ejecución queda en curso.
2. Core llama `execute()` contra A y A acepta. Cuando la instalación ya está parada, el test cierra A, crea un repositorio nuevo sobre el mismo `stateDir`, llama a `onModuleInit` (aquí se marca `FAILED / SANDBOX_RESTARTED`) y levanta B con `listen`.
3. El sondeo de Core pide el mismo `executionId` y el wrapper de `fetch` lo redirige a B.
4. Aserciones:
   - Core resuelve sin lanzar, con `status = FAILED`, `facts = null` y `failure` con `category = INFRASTRUCTURE` y `code = SANDBOX_RESTARTED`.
   - Solo se hace una consulta de estado y una de resultado (sin sondeo infinito).
   - `mapSandboxResult` devuelve `FAILED / INFRASTRUCTURE`.
   - El estado previo al reinicio no era terminal.
   - B persiste `FAILED/SANDBOX_RESTARTED`, su estado y su resultado validan contra el esquema.
   - No hay avisos de contrato.

Limitación declarada: `SandboxExecutionService.execute()` no ofrece consultar un `executionId` previo. El cambio de URL que simula el reinicio lo hace el test, no Core. Es la forma honesta de simular un reinicio sin modificar Core.

## Desajustes Core ↔ Sandbox

- **Ninguno** en el camino feliz ni en el de fallo. Core no emitió avisos de contrato en ninguno de los dos casos.
- Verificación de que el detector sí dispara: un sondeo ad hoc (no committeado, eliminado) con una aceptación inválida hizo que Core emitiera el aviso `Contrato Core↔Sandbox` y el espía lo contó. Así que el «cero avisos» no es vacío.
- Observaciones que no son desajustes:
  1. Con una ruta de runner fuera de `/app`, el Sandbox informa `suitePath` como `math.test.js` (basename). Sigue siendo relativo y Core no avisa. Por eso el test reescribe la ruta del contenedor a `/app/`, como ya hace T1b.
  2. Core no ofrece consulta de un `executionId` previo (ver arriba).

## Bloqueo: gate de pruebas en rojo por un fallo previo ajeno al WI

`app/src/executions/executions.persistence.spec.ts`, test «una ejecución terminal restaurada responde /result igual que antes del reinicio», falla de forma determinista con el reloj actual (`2026-10-19`).

Causa: el test fija `updatedAt`/`completedAt` a `2026-10-18T12:00:0x`. `RetainedExecutionRepository.evict()` expulsa los terminales con `updatedAt < now − 24 h` al recargar, así que el registro desaparece y aparece `EXECUTION_NOT_FOUND`. El fallo no lo causa este WI: el spec no está en el diff y la lógica viene de WI-SANDBOX-010.

Corrección propuesta (no aplicada, fuera de alcance y en código de otro WI): derivar las marcas temporales de `Date.now()` (p. ej. `new Date(Date.now() - 60_000).toISOString()`), o fijar el `now` del repositorio en el test. Pendiente de aprobación.

## Resultados (ejecutados, comandos desde `app/`)

| Gate | Resultado |
| --- | --- |
| `pnpm lint` (oxlint src/ test/) | exit 0, 0 avisos |
| `pnpm test` | exit 1 por el fallo previo. Test Files: 1 failed, 34 passed, 1 skipped (36). Tests: 1 failed, 310 passed, 5 skipped (316) |
| `core-client.contract.spec.ts` (aislado, 3 ejecuciones) | 2 passed en cada una; estable |
| `core-client.contract.spec.ts` sin Core (ruta falsa) | 1 passed (aviso), 2 skipped; carga sin error |
| `executions.contract-real.spec.ts` | 16/16 passed |
| `pnpm build` (nest build) | exit 0 |
| `pnpm contracts:check` | exit 0 |
| `node scripts/sdd-check.mjs` | exit 0, «SDD check OK» |
| `node harness/validate-work-items.mjs` | exit 0, «passed (SANDBOX, 6 WI)» |
| `node harness/validate-harness.mjs` | exit 0, «Harness V3 validation passed» |
| `node harness/validate-completions.mjs` | exit 0, «Completion validation passed (5 completed WI)» |
| prettier --check (archivos nuevos) | limpio |

Nota: `executions.contract-real.spec.ts` ya no está limpio con prettier en HEAD (estaba así antes de este WI). No se reformateó, para no ensuciar el diff.

## Archivos afectados

- `app/test/support/contract-real-sandbox.ts` (nuevo)
- `app/src/executions/core-client.contract.spec.ts` (nuevo)
- `app/src/executions/executions.contract-real.spec.ts` (modificado: imports y helper movido)
- `harness/reports/wi-sandbox-009-implementation.md` (este reporte)

Sin cambios en `../tjc-be-rag-core-api`, `spec/`, contratos, `harness/` (salvo este reporte) ni dependencias.

## Siguiente paso recomendado

Decidir cómo tratar el test previo: (1) aprobar la corrección de fechas relativas en `executions.persistence.spec.ts` como cambio mínimo aparte, o (2) aceptar el rojo y dejarlo registrado. Después, revisión independiente del WI con `reviewer`. Los 2 tests nuevos son la evidencia CT-06/CT-07 de este WI.

## Cambio mínimo del leader (declarado)
`app/src/executions/executions.persistence.spec.ts` (WI-SANDBOX-010) fijaba fechas `2026-10-18T12:00` y, al pasar 24 h, la retención de 24 h expulsaba el registro al recargar: la prueba «una ejecución terminal restaurada responde /result…» fallaba desde el día siguiente (defecto latente de tiempo, también habría roto la CI). Se cambiaron 3 líneas de un solo archivo de pruebas para usar fechas relativas a `Date.now()`; sin lógica de producto. Ejecutado por el leader por ser cambio mínimo (≤10 líneas, ≤2 archivos, solo pruebas). Resultado: `pnpm test` 311 pasan, 5 omitidos; lint, build y contracts:check en verde.
