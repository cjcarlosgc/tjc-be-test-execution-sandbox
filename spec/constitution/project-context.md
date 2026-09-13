# Contexto operativo del proyecto

**Estado:** APROBADO — SDD 2.0

`tjc-be-test-execution-sandbox` es el backend de ejecución aislada cuyo único consumidor es RAG Core. Ejecuta código no confiable y devuelve hechos; no genera pruebas ni interpreta objetivos de producto.

El servicio se implementa con NestJS/TypeScript. Los proyectos ejecutados se limitan a profiles explícitos: TypeScript con Jest/Vitest y PHP/Laravel con PHPUnit. Snapshots, rutas, logs y artefactos son potencialmente confidenciales.

El origen PR-driven no atraviesa esta frontera: instalación, repository, PR, usuario, preguntas, RAG y publicación pertenecen a Core/Console.
