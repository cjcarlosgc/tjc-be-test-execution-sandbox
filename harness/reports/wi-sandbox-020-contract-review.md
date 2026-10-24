Modelo: contract-reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-020 · Revisión de contrato (re-espejo SYSTEM-2.16 / INTEROP-2.21)

Veredicto: **APPROVED**

## Verificaciones

1. Espejo byte a byte contra `2318b9df` de Core: `system-contract.md` e `interoperability-contract.md` idénticos (`cmp`); los 35 archivos de `schemas/` (incluidos `examples/`) idénticos (bucle `git show 2318b9df:spec/contracts/<ruta> | cmp`, n=35, 0 diferencias). La lista de archivos coincide exactamente con `git ls-tree -r 2318b9df --name-only spec/contracts/schemas` (sin sobrantes ni faltantes). No existe `github-integration-contract.md` en el Sandbox.
2. Digests: system `d0a492b4...ea77` y interoperability `7f946d55...0d29d` coinciden con los eventos; árbol schemas `8079ab73...9718` coincide.
3. Impacto HTTP: respecto de HEAD solo cambian en `schemas/` `examples/manifest.json` (+75 líneas, entradas del webhook GitHub) y `examples/sandbox-result.failed.json` (`COMPOSER_INSTALL_FAILED` -> `DEPENDENCY_INSTALL_FAILED`); `sandbox-execution.schema.json`, `common` y `error-envelope` no cambian. Los diffs de prosa de system/interop son documentales (neutralización de LLM, `targetId` de ExperimentResults, cabeceras GH-INTEROP-1.9, esquema CT-01 del webhook); sin cambios de rutas, DTO, errores, auth ni idempotencia del Sandbox. El código emite `DEPENDENCY_INSTALL_FAILED` (`app/src/common/errors/sandbox-fact-error.ts:87`, usado en `execution-pipeline.service.spec.ts`).
4. `spec/features/**`: sin contradicciones; referencias antiguas (INTEROP-2.1, 2.8) son históricas y no entran en conflicto. Los cambios en `app/src/contracts/generated/` (+956 líneas) son solo la adición del esquema/tipos del webhook (no consumido por el Sandbox).

## Hallazgos

- BLOCKER: ninguno
- MAJOR: ninguno
- MINOR: el esquema `github-webhook-event` añade tipos generados no usados por el Sandbox (inocuo, consecuencia del espejo byte a byte del árbol).

## Comandos
`git -C ../tjc-be-rag-core-api show "2318b9df:spec/contracts/<f>" | cmp - spec/contracts/<f>`; `find . -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256` en `spec/contracts/schemas`; `git diff HEAD --name-only -- spec/contracts/schemas`.
