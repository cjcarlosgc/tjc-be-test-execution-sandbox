# 003-test-materialization — Plan

## Dependencias

- Constitución y transversales aplicables.

## Diseño técnico

ArtifactMaterializer escribe contenido proporcionado/obtenido por contrato. MERGE ya debe llegar resuelto desde RAG Core; Sandbox materializa el resultado final.

## Validación

- Pruebas automatizadas para reglas determinísticas y contratos.
- Casos positivos, negativos y estados terminales relevantes.
- `lint`, `test` y `build` antes de cierre.
