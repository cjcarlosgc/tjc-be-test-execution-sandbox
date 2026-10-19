Modelo: implementer-high · configurado claude-haiku-5-5 · atendido unknown · esfuerzo high

# WI-SANDBOX-013 — Implementación (pruebas de contrato real Core ↔ Sandbox)

Estado: **IMPLEMENTADO, pendiente de revisión independiente** (sin commit). Las pruebas de contrato están escritas y en verde. El incumplimiento real A (`suitePath` absoluto en Jest/Vitest) está corregido en producción con un cambio mínimo, según decisión del leader. `pnpm lint`, `pnpm test`, `pnpm build` y `pnpm contracts:check` pasan.

## 1. Pruebas añadidas

Archivo nuevo: `app/src/executions/executions.contract-real.spec.ts` (16 pruebas, todas en verde).

Pipeline real con fakes solo en los bordes: contenedor (`ContainerRunner`: instalación y ejecución de tests, que escribe la salida del runner en la ruta montada), descargas de snapshot y artefactos, y creación de directorios de workspace. Adapters Jest/Vitest/PHPUnit, parsers, `ArtifactMaterializer`, `SafeArchiveExtractor`, `ExecutionsService`, guard Bearer, `ValidationPipe` y `HttpExceptionFilter` son reales, expuestos por HTTP con el módulo Nest. Las respuestas se validan con `validateContract` contra `spec/contracts/schemas`. Salida de runner: fixtures reales de `src/runner-adapters/fixtures` (Vitest/Jest JSON y PHPUnit JUnit XML). Peticiones: ejemplos canónicos de `spec/contracts/schemas/examples`.

| Prueba | Describe | Qué comprueba | Estado |
|---|---|---|---|
| T4 | C-06 Execution Coordinator → Sandbox | POST sin `phase` de extremo a extremo; el comando del contenedor recibe `src/foo.spec.ts` (fase efectiva GENERATED_TESTS); status y resultado validados | verde |
| T5 | C-06 | `phase=BASELINE` con artifacts → 400, ErrorEnvelope válido, no se persiste. Refuerza a nivel HTTP «rejects BASELINE with artifacts» de `executions.service.spec.ts`; no la duplica | verde |
| T6 | C-06 | Misma carga y mismo `requestId`, `phase` distinta → 409 `IDEMPOTENCY_CONFLICT`; la ejecución original no cambia | verde |
| T9 | C-06 | `executionProfile` no soportado (`PYTHON_PYTEST`) → 400 `VALIDATION_ERROR`, ErrorEnvelope válido, nada aceptado ni ejecutado | verde |
| T10 (POST) | C-06 | ErrorEnvelope válido y sin `retryable` en 400 por validación, 400 `IDEMPOTENCY_KEY_REQUIRED` y 401 | verde |
| T1 | C-07 Sandbox → Execution Coordinator | Resultado NODE real (Vitest) valida `SandboxExecutionResultResponse`; `facts.executionProfile === 'NODE_TYPESCRIPT'` | verde |
| T1b | C-07 | Igual que T1, con las rutas del runner tal como las ve el contenedor (`/app/...`): `suitePath` = `src/math.test.js` | verde |
| T2 | C-07 | Resultado PHP real (PHPUnit JUnit, petición canónica con `projectRoot: apps/api`) valida; `facts.executionProfile === 'PHP_LARAVEL_PHPUNIT'` | verde |
| T3 | C-07 | Toda `evidence[].stage` valida contra `SandboxStage` y es `RUNNING_TESTS`, en éxito, fallo de test, compilación y timeout | verde |
| T7 (Node) | C-07 | Aserción fallida real: COMPLETED, `facts.passed=false`, `failure` null, `failureKind` ASSERTION solo en el caso fallido | verde |
| T7 (PHP ASSERTION) | C-07 | JUnit `<failure>` → `failureKind` ASSERTION | verde |
| T7 (PHP ERROR) | C-07 | JUnit `<error>` → `failureKind` ERROR; `<skipped/>` → SKIPPED con `failureKind` null | verde |
| T8a | C-07 | Timeout de tests → TIMED_OUT, `failure` `TEST_TIMEOUT`/`TEST_RUNTIME` en RUNNING_TESTS | verde |
| T8b | C-07 | `ImageUnavailableError` en instalación → FAILED, `IMAGE_UNAVAILABLE`/`INFRASTRUCTURE` en INSTALLING_DEPENDENCIES, `failureCode` en el status | verde |
| T8c | C-07 | PHP con reporte vacío y error de sintaxis → `TEST_COMPILATION_FAILED`/`COMPILATION` en RUNNING_TESTS, `facts` null | verde |
| T10 (GET) | C-07 | 404 (status y result) y 409 `EXECUTION_NOT_FINISHED` mientras la instalación está retenida; envelope válido y sin `retryable` | verde |

CT-06 corresponde al describe «C-06 Execution Coordinator → Sandbox» y CT-07 al describe «C-07 Sandbox → Execution Coordinator». Las etiquetas CT-06/CT-07 vienen de la tesis (Anexo E) y no aparecen en `spec/`.

Pruebas unitarias añadidas para la corrección A (ver sección 2): 7 en `app/src/runner-adapters/jest-compatible-result-parser.spec.ts` y 2 en `app/src/runner-adapters/phpunit-junit-result-parser.spec.ts`.

## 2. Bug A (corregido): `suitePath` absoluto en Jest/Vitest

**Hallazgo.** `facts.testCases[].suitePath` copiaba `testResults[].name` tal cual. Jest y Vitest informan la ruta absoluta del archivo de prueba (dentro del contenedor, `/app/...`). El esquema exige `RelativePath` (`^(?!/)...`), así que la respuesta de resultado no validaba.

**Caso mínimo.** Un reporte Vitest real con `testResults[].name` absoluto. `validateContract` devolvía `/facts/testCases/0/suitePath: must match pattern ...`, además de `must be null` y `oneOf` (y `/facts: must be null` por el mismo motivo).

**Control.** El mismo fixture `vitest-passing.json` con la ruta reescrita a relativa (`src/math.test.js`) validaba sin errores. La causa era únicamente el prefijo absoluto.

**Por qué no lo detectaban las pruebas previas.** Usaban nombres relativos (`src/math.test.ts`, `src/foo.spec.ts`). El parser PHP usa nombres de suite de clase, que ya eran relativos.

**Corrección (producción, cambio mínimo).**
- Nuevo `app/src/runner-adapters/runner-result-paths.ts` con `toRelativeSuitePath(name, containerRoot?)`:
  - Ruta absoluta bajo `containerRoot` → relativa a esa raíz.
  - Ruta ya relativa → normalizada con separadores POSIX (`\` convertido a `/`, `./` eliminado).
  - Cualquier otro caso (fuera de la raíz, unidad de Windows, UNC, o `..` tras normalizar) → nombre base seguro. Nunca emite ruta absoluta ni con `..`.
  - No modifica mensajes de error ni nombres de caso. No hay rutas de la máquina ni `/tmp` hardcodeados.
- La raíz se inyecta desde el pipeline: `adapter.parseResult(rawResults, containerWorkingDir)` en `app/src/executions/execution-pipeline.service.ts`. `containerWorkingDir` ya existía (`toContainerWorkingDir`: `/app` o `/app/<projectRoot>`), que es el directorio de trabajo real del comando de tests dentro del contenedor.
- `TestRunnerAdapter.parseResult(rawOutput, containerRoot?)` en `app/src/runner-adapters/test-runner-adapter.ts`. Jest, Vitest y PHPUnit lo reenvían a sus parsers.
- `parseJestCompatibleJson(..., containerRoot?)` y `parsePhpunitJunitXml(..., containerRoot?)` usan el helper para `suitePath`. PHPUnit se toca porque el mismo campo sale del mismo modo en su parser (el helper no cambia nombres relativos como `MathTest`).
- Sin `containerRoot`, las rutas absolutas se reducen a su nombre base. Así no se emite nunca una ruta absoluta.

**Decisión sobre rutas del host en las pruebas.** Los fixtures de `runner-adapters/fixtures` se conservan tal cual (rutas de la máquina de origen, `/private/tmp/...`). Con ellas, la raíz `/app` no coincide y `suitePath` queda en el nombre base (`math.test.js`). T1, T4 y T7-Node pasan con ese comportamiento. Para comprobar la relativización real bajo la raíz del contenedor, T1b reescribe el prefijo a `/app/` en el contenido del reporte y comprueba `src/math.test.js`.

## 3. Comandos y resultados (ejecutados, salidas en scratchpad de la sesión)

- `pnpm lint` (oxlint src/ test/): exit 0, sin avisos.
- `pnpm contracts:check`: exit 0.
- `pnpm build` (nest build): exit 0.
- `pnpm test` (vitest run): exit 0. Test Files: 34 passed | 1 skipped (35). Tests: **306 passed | 4 skipped (310)**.
- Antes de la corrección: `pnpm test` exit 1, 3 failed | 293 passed | 4 skipped (300). Los 3 fallos eran T1, T4 y T7-Node, todos por A.
- `executions.contract-real.spec.ts`: 16 de 16 pasan.
- `src/runner-adapters` y `src/executions`: 14 archivos, 182 pruebas, todas en verde.

## 4. Verificación de digests del espejo

| Elemento | Esperado | Obtenido | Resultado |
|---|---|---|---|
| `spec/contracts/system-contract.md` | b70f9358…0444 | b70f9358fabdaa6d8ac61d07e25258ec5256f9dacd31049edb4f08e6879a0444 | coincide |
| `spec/contracts/interoperability-contract.md` | b9ed40dc…ea05 | b9ed40dc8d15a414b7cca4ccee4f320ba9da8f7444ef426b8321d17bdc0dea05 | coincide |
| Árbol `spec/contracts/schemas` (`cd spec/contracts/schemas && find . -type f \| LC_ALL=C sort \| xargs shasum -a 256 \| shasum -a 256`) | c45e4513…1b31 | c45e4513f4f8b3e8f2649f5b1c8f63fc4a187ddfb5fa0fb1232f85fb29fa1b31 | coincide |

Además, `diff -r` del árbol de esquemas frente a `tjc-be-rag-core-api/spec/contracts/schemas`: sin diferencias. Los dos Markdown canónicos de Core tienen los mismos digests. No se han modificado contratos ni espejo.

## 5. Hallazgos y observaciones

**B. Decidido: `TEST_ASSERTION` no se emite.** Un test fallido no es un fallo del Sandbox: `failure` es null y `facts.passed=false`, conforme a INTEROP §7.3. El valor `TEST_ASSERTION` existe en el enum del esquema, pero ningún camino del pipeline lo produce. La prueba T7 no lo afirma.

**C. Corregido: `pollAfterMs` sí se emite, en el 202.** `SandboxExecutionAcceptedResponse` (respuesta a `POST /executions`) incluye `pollAfterMs` (valor de `SANDBOX_POLL_AFTER_MS`, 2000 por defecto, `executions.service.ts:233`) y el esquema lo exige. El GET de estado (`SandboxExecutionStatusResponse`) no lo incluye. El análisis SDD mezclaba ambos puntos y decía que no se emitía. `retryable` no se emite: es opcional según INTEROP-2.17 §4 (lo declaran los servicios cuyo contrato distingue reintentos, `GH-INTEROP`), y el Sandbox no distingue reintentos.

**D. Observaciones (no tocadas, según decisión del leader).**
- Profile/runner incompatibles (`NODE_TYPESCRIPT` + `PHPUNIT`): el DTO acepta ambos valores, el servicio no comprueba la tabla `EXECUTION_PROFILE_RUNNERS`, y el request se acepta con 202. Después falla como `FAILED`/`UNSUPPORTED_EXECUTION_PROFILE`. INTEROP §7.4 dice que los `UNSUPPORTED_*` detectables se rechacen con 422 antes de aceptar. Hay ambigüedad entre la regla y el código. Sin prueba.
- Jest/Vitest: no hay fixture real con `failureKind` ERROR (los reales son todos aserciones). ERROR en Node queda cubierto solo por tests unitarios de parser.
- Jest: el fixture `jest-syntax-error.json` produce COMPLETED con `facts.compiled=false` y `failure` null, no `TEST_COMPILATION_FAILED`. Solo PHP tiene esa rama. Conviene que el leader confirme si es intencionado.
- IMAGE_UNAVAILABLE: el contenedor falso lanza el error directamente. El mapeo real está en `container-runner.service.ts:534` (`provisionImage`) y `container-runner.service.spec.ts:599`. La etapa del `failure` es la de la llamada que lo lanza, aquí `INSTALLING_DEPENDENCIES`.
- La redacción de estado (`execution-state.codec.ts`) sigue aplicándose a `suitePath`; un valor relativo pasa sin cambios.

## 6. Archivos

- Nuevo: `app/src/executions/executions.contract-real.spec.ts`.
- Nuevo: `app/src/runner-adapters/runner-result-paths.ts`.
- Modificados (producción): `app/src/executions/execution-pipeline.service.ts` (una línea: se pasa `containerWorkingDir`), `app/src/runner-adapters/test-runner-adapter.ts`, `jest-compatible-result-parser.ts`, `phpunit-junit-result-parser.ts`, `jest-test-runner.adapter.ts`, `vitest-test-runner.adapter.ts`, `phpunit-test-runner.adapter.ts`.
- Modificados (pruebas): `app/src/runner-adapters/jest-compatible-result-parser.spec.ts`, `app/src/runner-adapters/phpunit-junit-result-parser.spec.ts`.
- Sin tocar: `spec/`, contratos y su espejo, `harness/state.json`, `harness/work-items.json`, ejemplos de contrato.
- Cambios de `harness/state.json`, `harness/work-items.json` y `spec/features/001-execution-api/tasks.md` ya existían antes de este trabajo y no los he modificado.
- Sin seguimiento antes de este trabajo y sin tocar: `harness/reports/wi-sandbox-013-contract-review.md` y `harness/reports/wi-sandbox-013-sdd-analysis.md`.
- Archivos temporales de sonda creados y eliminados. Sin commit ni push.

## 7. Próximo paso recomendado

1. Revisión independiente del WI (reviewer) y de contrato, sobre el cambio de `suitePath` (producción) y las pruebas nuevas.
2. Decidir D (profile/runner incompatibles, 202 frente a 422) si se quiere alinear con INTEROP §7.4.
3. Confirmar la rama de compilación de Jest (`compiled=false` sin `TEST_COMPILATION_FAILED`).
