# 008-reliability-lifecycle — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

LifecycleCoordinator mantiene state machine y finally cleanup. Sweeper periódico por TTL. Métricas de active containers/workspaces/cleanup failures.

## Persistencia de ejecuciones (WI-SANDBOX-010)

`FileExecutionRepository` reemplaza al repositorio en memoria en el módulo: mantiene los mapas en memoria (lecturas síncronas, sin cambiar la interfaz `ExecutionRepository`) y escribe cada `save` a disco de forma atómica y síncrona. Funciones puras de serialización (`execution-state.codec`) aplican la lista blanca de la spec, de modo que snapshot, artifacts, URLs y rutas no tienen camino hacia el disco. La carga ocurre en `onModuleInit`, antes de que el controlador acepte tráfico. La expulsión por retención borra también el archivo. El contrato HTTP no cambia.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
