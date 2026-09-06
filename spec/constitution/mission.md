# Misión

**Estado:** aprobado

Ejecutar y observar pruebas generadas para proyectos TypeScript en un entorno temporal y aislado. El Sandbox no conoce ni decide si una generación proviene de RAG, de un agente generalista o de cualquier estrategia comparativa; recibe una solicitud neutral con URLs firmadas temporales, descarga y verifica la versión exacta, materializa los artefactos, ejecuta el runner y devuelve hechos estructurados a RAG Core.

## Consumidor

El consumidor V1 es exclusivamente `tjc-be-rag-core-api`. El frontend no llama directamente al Sandbox.

## Principios

- Aislamiento por ejecución.
- Workspace y container efímeros.
- Resultado objetivo, no interpretación experimental.
- Cleanup en success, failure y timeout.
- Límites configurables de CPU, memoria y tiempo.
- Sin credenciales Supabase/DB ni persistencia autoritativa del producto.
