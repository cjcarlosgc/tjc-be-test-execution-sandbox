# Contexto operativo del proyecto

**Estado:** APROBADO
**Alcance:** contexto mínimo para especificación, implementación y revisión; no agrega contratos funcionales.

`tjc-be-test-execution-sandbox` es el segundo backend de una solución de tesis compuesta por dos backends y un frontend. Su único consumidor V1 es RAG Core; el frontend nunca lo llama directamente. Ejecuta código no confiable en aislamiento y devuelve hechos, sin generar pruebas ni interpretar estrategias experimentales.

La implementación del servicio usa NestJS + TypeScript. Distintamente, los proyectos ejecutados también quedan restringidos en V1 a TypeScript (`.ts`/`.tsx`) con Jest o Vitest. La denominación académica “ecosistema JavaScript/TypeScript” no habilita archivos JavaScript puros.

La validación final ocurrirá en el área de desarrollo de una empresa real. Snapshots, rutas, logs y artefactos pueden ser confidenciales: deben mantenerse acotados, trazables, sin secretos dentro del container y sujetos a retención/eliminación acordadas.

El Sandbox permanece ciego a `RAG`, `GENERALIST_AGENT` y cualquier baseline: recibe una solicitud de ejecución neutral y no registra conclusiones experimentales.

No incorporar aquí papers, marco teórico, nombres académicos, estructura de capítulos ni roles organizativos que no cambien un contrato implementable.

Las condiciones todavía pendientes para la validación empresarial se rigen por `DEC-VAL-001` en `spec/contracts/system-contract.md`.
