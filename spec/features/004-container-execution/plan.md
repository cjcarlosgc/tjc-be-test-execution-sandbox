# 004-container-execution — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

DockerExecutionService usa dockerode. Fases separadas para distinguir DEPENDENCY/COMPILATION/RUNNING_TESTS. Timeout controller mata container y devuelve evidence.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
