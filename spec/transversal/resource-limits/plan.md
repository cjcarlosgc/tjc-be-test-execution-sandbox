# resource-limits — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

Definir un esquema de configuración validado para CPU shares/quotas, RAM, PIDs, almacenamiento temporal, stdout/stderr, tamaño/expansión del ZIP y deadlines global/por etapa. Aplicarlo tanto al downloader/extractor como a Docker y convertir cada agotamiento en un resultado terminal verificable. Valores concretos por entorno, no hardcodeados.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
