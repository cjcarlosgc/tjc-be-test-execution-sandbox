# 006-execution-results — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU14, HU19

## Objetivo

Devolver evidencia estructurada de compilación, ejecución y casos de prueba.

## Reglas y comportamiento

- `SandboxExecutionStatusResponse` y `SandboxExecutionResultResponse` siguen `INTEROP-2.0`.
- `RunnerFacts` conserva compiled, executed, passed, totalTests, passedTests, failedTests, skippedTests y testCases.
- TestCaseResult conserva nombre/status/duration/error resumido.
- stdout/stderr se demultiplexan y acotan; evitar payloads ilimitados.
- Resultado indica stage y duraciones.
- Core interpreta `valid` y FailureType final.
- Sandbox retorna el resultado a Core; RAG Core conserva el estado/resultado autoritativo y lo persiste en PostgreSQL.
- El resultado ordinario no incluye mutation score. `DEC-MET-001` permanece PENDING y solo bloquea una futura extensión coordinada para mutation testing/StrykerJS.
- La evidencia empresarial debe acotar y sanear logs, rutas y errores para no filtrar código o secretos innecesarios.
- `ExecutionEvidenceFact` se devuelve inline con límites y marca `truncated`. Si se necesita evidencia extensa, requiere un mecanismo futuro aprobado y gestionado por Core; Sandbox no accede a Storage para publicarla.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
