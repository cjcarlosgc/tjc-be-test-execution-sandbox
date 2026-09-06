# Misión

**Estado:** aprobado

Ejecutar y observar pruebas generadas para proyectos TypeScript en un entorno temporal y aislado. El Sandbox no conoce ni decide si una generación proviene de RAG, de un agente generalista o de cualquier estrategia comparativa; recibe una solicitud neutral, reconstruye la versión exacta del proyecto desde Supabase Storage mediante `ObjectStorageService`, materializa los artefactos, ejecuta el runner y devuelve hechos estructurados.

## Consumidor

El consumidor V1 es exclusivamente `tjc-be-rag-core-api`. El frontend no llama directamente al Sandbox.

## Principios

- Aislamiento por ejecución.
- Workspace y container efímeros.
- Resultado objetivo, no interpretación experimental.
- Cleanup en success, failure y timeout.
- Límites configurables de CPU, memoria y tiempo.
