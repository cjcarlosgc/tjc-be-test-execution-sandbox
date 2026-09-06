# timeouts-cleanup — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Hacer terminal toda ejecución y limpiar recursos.

## Reglas y comportamiento

- Configurar deadline global y timeout por adquisición, instalación, compilación y ejecución; el request no puede aumentarlos.
- Al expirar, impedir nuevas etapas, terminar procesos/container y producir estado terminal `TIMED_OUT` con evidencia ya acotada.
- Ejecutar cleanup idempotente de container y workspace en success, failure, timeout y cancelación del proceso host.
- Intentar capturar hechos disponibles antes del cleanup sin retrasar indefinidamente la terminación.
- Un error de cleanup se registra de forma saneada y queda para el sweeper; no sustituye ni oculta el resultado principal.
- Un sweeper elimina recursos huérfanos por TTL sin tocar rutas fuera de la raíz administrada.


## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
