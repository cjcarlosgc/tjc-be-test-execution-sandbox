# resource-limits — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Configurar memory, CPU shares/quotas, pids y deadline global. Valores concretos por entorno, no hardcodeados.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
