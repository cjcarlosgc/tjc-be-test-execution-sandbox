# container-isolation — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Containers no privilegiados, sin Docker socket, mounts mínimos, IDs/labels por executionId. Network policy mínima y configurable.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
