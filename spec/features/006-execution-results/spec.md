# 006-execution-results — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU14, HU19

## Objetivo

Devolver evidencia estructurada de compilación, ejecución y casos de prueba.

## Reglas y comportamiento

- TestRunnerResult: totalTests,passedTests,failedTests,testCases.
- TestCaseResult conserva nombre/status/duration/error resumido.
- stdout/stderr se demultiplexan y acotan; evitar payloads ilimitados.
- Resultado indica stage y duraciones.
- Core interpreta `valid` y FailureType final.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
