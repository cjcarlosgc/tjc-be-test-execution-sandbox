# resource-limits — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Evitar consumo ilimitado de recursos por código de terceros.

## Reglas y comportamiento

- Toda ejecución tiene límites configurables de tiempo total y por etapa, CPU, RAM, almacenamiento temporal, cantidad de procesos/PIDs y bytes de stdout/stderr/resultados.
- Los límites son política del Sandbox: ningún request de Core puede aumentarlos.
- Exceder tiempo produce `TIMED_OUT`; OOM, disco, PID u otro límite se normaliza como fallo factual con etapa/categoría, sin perder cleanup.
- Descargas y extracción tienen límites independientes de tamaño comprimido, tamaño expandido, cantidad de entradas y relación de expansión para reducir riesgo de archivos excesivos o zip bombs.
- La configuración concreta puede variar por entorno, pero debe validarse al iniciar y registrarse sin secretos.


## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
