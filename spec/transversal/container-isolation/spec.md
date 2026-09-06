# container-isolation — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Aislar cada ejecución y limitar impacto sobre host/otras ejecuciones.

## Reglas y comportamiento

- Tratar snapshots y artefactos como entrada no confiable, incluso cuando provengan de un repositorio empresarial autorizado.
- Crear container y workspace efímeros por `executionId`, sin modo privilegiado ni Docker socket dentro del container.
- No montar credenciales, variables secretas ni directorios del host ajenos a la ejecución.
- Aplicar límites configurables de CPU, RAM, almacenamiento temporal, procesos, salida y deadline global; cleanup en success, failure y timeout.
- No montar el filesystem del host fuera del workspace mínimo requerido; usar filesystem/container desechable y usuario no-root cuando sea compatible.
- Reducir la red por etapa al mínimo necesario: separar descarga/instalación de dependencias de compilación/ejecución de tests y cortar la red de tests cuando sea viable.
- Acotar stdout/stderr y evitar exponer innecesariamente contenido confidencial en logs o respuestas.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
