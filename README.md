# tjc-be-test-execution-sandbox

Backend aislado que prepara workspaces temporales, ejecuta Jest/Vitest/PHPUnit en Docker y devuelve resultados estructurados al RAG Core API. Línea base: SDD 3.1 / Harness V3.

## Estructura

- `spec/`: fuente funcional/técnica vigente.
- `harness/`: workflow, estado y evidencia de implementación.
- `scripts/`: validadores neutrales de SDD.
- `.claude/` y `.agents/`: adaptadores opcionales; no son fuente de verdad.
- `app/`: código fuente generado.

## Inicio

1. Leer `AGENTS.md`.
2. Leer `spec/README.md`.
3. Ejecutar `node scripts/sdd-check.mjs`.
4. Seleccionar un WI local de `harness/work-items.json` enlazado desde `tasks.md`, registrarlo en `harness/state.json` y ejecutar `node harness/validate-harness.mjs`.
