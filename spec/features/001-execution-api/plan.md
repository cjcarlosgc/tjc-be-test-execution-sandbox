# 001-execution-api — Plan

## Dependencias

- Constitución y transversales aplicables.
- `spec/contracts/system-contract.md`, donde `DEC-INT-001` está aprobado.
- `spec/contracts/interoperability-contract.md`.

## Diseño técnico

Módulo de feature con controller y DTOs explícitos, `ExecutionService` y repositorio de estado operativo. Implementar `202 + polling`, idempotencia, auth/correlación y filtros de error según `INTEROP-2.0`; no retornar entidades internas directamente ni convertir ese estado local en persistencia autoritativa del producto.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
