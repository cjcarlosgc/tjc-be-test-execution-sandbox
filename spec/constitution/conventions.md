# Convenciones

- El Sandbox devuelve hechos: exitCode, stage, runnerResult, logs/evidence; no calcula `valid` académico por estrategia.
- Workspace path generado por executionId; nunca incorporar path absoluto proveniente del usuario.
- Toda extracción y escritura valida traversal/symlinks peligrosos.
- Todo container se identifica por executionId y se destruye al final.
- Timeouts y resource limits vienen de configuración.
- No exponer filesystem host salvo workspace estrictamente requerido.
- No logs de secrets/env sensibles.
