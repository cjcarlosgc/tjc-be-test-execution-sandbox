# 004-container-execution — Tareas

- [x] dockerode client.
- [x] image/runtime selection.
- [x] limits.
- [x] install/compile/test commands seguros. — `DEC-SBX-002` (APROBADO): `corepack pnpm@<versión>` con `--frozen-lockfile` (red acotada a esa etapa) y el comando del `TestRunnerAdapter` resuelto (sin red). No hay una etapa `COMPILING` separada: Jest/Vitest transpilen TypeScript al vuelo y un fallo de compilación se refleja en `RunnerFacts.compiled=false` (005-test-runner-adapters), no en un `tsc` adicional.
- [x] timeout kill.
- [x] remove container.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
