# Product Backlog de la solución

**Estado:** catálogo de producto común a los cuatro repositorios (SDD 3.1). Este repositorio (Test Execution Sandbox) lo adopta tal cual; su participación concreta está en la sección siguiente. El backlog anterior de 47 HU (SDD 2.1) se conserva en `spec/legacy/backlog-sdd-2.1.md`.

Este catálogo fija seis épicas y dieciocho historias orientadas a valor. Las historias son transversales; no son unidades de commit ni equivalen uno a uno a un work item. La tesis aporta la estructura de planificación S1–S4, pero el comportamiento implementable se decide en las specs y contratos vigentes. No se crean automáticamente nuevas épicas o HU a partir de ideas, hallazgos o tareas técnicas.

## Épicas fijas

| ID | Épica | Resultado de producto |
| --- | --- | --- |
| EP01 | Projects | Gestionar proyectos y repositorios autorizados. |
| EP02 | Repository Intelligence | Comprender código, pruebas existentes, contexto e impacto. |
| EP03 | Functional Knowledge | Capturar, reutilizar y mantener intención funcional bajo autoridad humana. |
| EP04 | Generation & Validation | Generar y validar pruebas con evidencia. |
| EP05 | PR Workflow | Integrar análisis, revisión y publicación en el flujo real de PR. |
| EP06 | Experiments | Comparar enfoques sobre entradas y condiciones reproducibles. |

Las épicas son categorías estables, no objetos con un estado `PLANNED`. Su progreso se infiere de sus HU y work items.

## Historias de usuario fijas

`H-READY` significa que alcance, criterios y dependencias están suficientemente claros para seleccionar trabajo; no significa que la HU ya esté implementada. `H-DONE` exige evidencia del incremento completo, no solo un work item. Las 18 HU inician prudentemente en `H-BACKLOGGED`: la implementación con IDs antiguos no se toma como aceptación automática.

| HU | Épica | Sprint de referencia | Prioridad | Estado | Historia y criterio principal |
| --- | --- | --- | --- | --- | --- |
| HU01 | EP01 | S1 | Must | H-BACKLOGGED | Como responsable de proyecto, necesito registrar y gestionar un proyecto para centralizar análisis y resultados. Un usuario autorizado puede crearlo y consultar su estado estable. |
| HU02 | EP01 | S1 | Must | H-BACKLOGGED | Como responsable de proyecto, necesito vincular un repositorio GitHub autorizado para analizar cambios del equipo. El binding y la rama de integración son verificables y revocables. |
| HU03 | EP02 | S1 | Must | H-BACKLOGGED | Como desarrollador, necesito comprender elementos y relaciones del repositorio para recuperar su estructura técnica. El índice liga archivos, símbolos, relaciones, chunks y embeddings al commit. |
| HU04 | EP02 | S1 | Must | H-BACKLOGGED | Como desarrollador, necesito identificar tests asociados a los componentes para evitar redundancias. La asociación con símbolos conserva evidencia. |
| HU05 | EP02 | S2 | Must | H-BACKLOGGED | Como desarrollador, necesito recuperar contexto técnico relevante para alimentar la generación. Retrieval combina evidencia semántica y estructural y registra sus candidatos. |
| HU06 | EP02 | S3 | Must | H-BACKLOGGED | Como desarrollador, necesito identificar elementos modificados y potencialmente afectados para enfocar el análisis. El changeset distingue impacto directo e indirecto con traza. |
| HU07 | EP03 | S3 | Must | H-BACKLOGGED | Como desarrollador, necesito reutilizar reglas funcionales vigentes para evitar preguntas repetidas. Una regla ACTIVE aplicable entra en el contexto del Run. |
| HU08 | EP03 | S3 | Must | H-BACKLOGGED | Como usuario autorizado, necesito responder una aclaración funcional para continuar el análisis. Si el HEAD sigue vigente, continúa el mismo Run y se registra la autoridad de la respuesta. |
| HU09 | EP03 | S4 | Should | H-BACKLOGGED | Como responsable de proyecto, necesito actualizar reglas obsoletas o conflictivas para no usar conocimiento inválido. La regla reemplazada pasa a SUPERSEDED. |
| HU10 | EP04 | S2 | Must | H-BACKLOGGED | Como desarrollador, necesito generar pruebas con contexto recuperado para reducir omisiones y redundancias. El resultado incluye candidatas o declara que no se necesitan más. |
| HU11 | EP04 | S2 | Must | H-BACKLOGGED | Como desarrollador, necesito validar las candidatas en Sandbox aislado antes de incorporarlas. La ejecución devuelve evidencia sin credenciales GitHub. |
| HU12 | EP04 | S2 | Must | H-BACKLOGGED | Como desarrollador, necesito consultar la evidencia de generación y validación para comprender un Run. El detalle muestra diff, contexto, logs, estado y trazabilidad. |
| HU13 | EP04 | S3 | Must | H-BACKLOGGED | Como desarrollador, necesito distinguir fallos técnicos de posibles discrepancias de comportamiento. Un test respaldado por regla vigente puede clasificarse BEHAVIORAL_MISMATCH sin autoreparar su aserción. |
| HU14 | EP05 | S3 | Must | H-BACKLOGGED | Como desarrollador, necesito analizar automáticamente un PR para recibir validación en el flujo habitual. Un HEAD nuevo crea otro AnalysisRun y vuelve obsoleto al previo. |
| HU15 | EP05 | S4 | Must | H-BACKLOGGED | Como desarrollador, necesito recorrer la relación entre cambio, contexto, prueba y ejecución. Trace enlaza changeset, símbolos, contexto, test y evidencia. |
| HU16 | EP05 | S4 | Should | H-BACKLOGGED | Como desarrollador, necesito revisar y publicar pruebas por un companion PR. Una propuesta vigente aprobada crea rama y PR controlados, nunca un merge autónomo. |
| HU17 | EP06 | S4 | Must | H-BACKLOGGED | Como investigador, necesito comparar RAG con GENERALIST_AGENT bajo condiciones experimentales externas controladas. Ambos brazos comparten snapshot, target y entorno y guardan resultados por trial. |
| HU18 | EP06 | S4 | Could | H-BACKLOGGED | Como investigador, necesito capturar el siguiente PR elegible para evaluar enfoques sobre un cambio real. La captura se desarma al reservar el Run y no publica Checks experimentales. |

El texto del criterio es un resumen; la aceptación detallada vive en la feature correspondiente. Los sprints son referencias de planificación, no prueba de que una historia esté aceptada o terminada. En particular, trabajo implementado bajo IDs antiguos debe reauditarse antes de marcar una HU `H-DONE`.

## Relación con ejecución

`EP → HU → T (subtarea técnica en tasks.md) → WI (work item local al repositorio)`. La relación T→WI es muchos-a-uno o uno-a-uno según el corte; toda subtarea que se implemente declara al menos un WI. Un WI puede cubrir más de una HU si el corte es coherente. Los IDs de HU son globales; los WI se registran y validan en su repositorio. Core, Console, Sandbox y GitHub Integration tienen WIs propios. No se crea un WI de Sandbox en Core para simular trabajo del compañero.

Una idea nueva entra como `I-BACKLOGGED` sin alterar estas 18 HU; al seleccionarla se encaja en una HU existente o se solicita una decisión explícita de cambio de alcance. Retirar una funcionalidad se planifica como subtarea/WI con criterios de eliminación y de preservación de datos, no se borra silenciosamente una HU ya aceptada.

## Prioridad inmediata de la reorientación

1. P0: alinear SDD, Harness y contratos de Core/Console; retirar carga manual ZIP y descarga legacy de artefactos del producto, preservando snapshot ZIP interno y evidencia persistida.
2. P1: extraer toda interacción con GitHub desde Core a `tjc-be-github-integration-api`, por cortes contractuales y con reutilización de código.
3. P2: formalizar OC01–OC15 y sus subcasos en specs con trazabilidad a HU, comenzando por happy paths; el registro preliminar está en `spec/operational-cases.md`.
4. Diferido: homologar Sandbox cuando el usuario recupere ese repositorio. Mutation testing está descartado para este alcance, no es un work item activo.

## Ideas diferidas

- **I-GH-001 · aseguramiento de Checks 1.7:** cuando se seleccione un nuevo WI de mantenimiento, ejecutar una revisión independiente post-fix y ampliar la matriz de regresión de transiciones `ACTIVE`/incertidumbre para el mutex efímero. Surge del cierre humano de `WI-GH-012`; no describe una incompatibilidad funcional conocida ni crea trabajo activo automáticamente.

## Participación de Sandbox

Sandbox ejecuta pruebas en contenedores aislados y devuelve evidencia estructurada a Core; no conoce GitHub, RAG ni el dominio de Projects. Participa en estas historias:

| HU | Qué aporta el Sandbox |
| --- | --- |
| HU11 | Valida las pruebas candidatas en un contenedor aislado, sin credenciales GitHub, con perfiles de ejecución Jest/Vitest/PHPUnit y límites de recursos (features 001–009). |
| HU12 | Entrega logs, estado, etapas y tiempos de cada ejecución como evidencia consultable por Core. |
| HU13 | Emite hechos del runner (`failureKind` ASSERTION/ERROR, códigos de fallo) sin clasificarlos; la clasificación es de Core. |
| HU17 | Garantiza condiciones de ejecución equivalentes (perfil, límites, aislamiento) para los brazos experimentales. |

El resto de las historias no aplica a este repositorio.

## Mapa histórico SDD 2.1 → catálogo vigente

El backlog de 47 HU de SDD 2.1 se retiró de la especificación vigente (copia en `spec/legacy/backlog-sdd-2.1.md`). Las HU antiguas que mencionan las features de Sandbox se leen así:

| HU antigua | HU vigente | Nota |
| --- | --- | --- |
| HU08–HU12 (generar pruebas) | HU11 | Sandbox solo valida lo generado. |
| HU14 (resultados de validación) | HU12 | Evidencia de ejecución. |
| HU19 (comparar RAG vs agente generalista) | HU17 | Condiciones equivalentes de ejecución. |
| HU23 (autorreparación) | — | Descartada en SDD 2.1; sin equivalente. |
| HU24 (reintentar generación) | HU11 | Reintento a cargo de Core. |
| HU43 (perfil PHP/Laravel/PHPUnit) | HU11 | Perfil de ejecución PHP. |
| HU47 (desplegar Sandbox remoto) | HU11 | Habilitador de infraestructura (DEC-INF-001/002). |
| HU46 (investigar mutation testing) | — | Descartada para este alcance; sin equivalente. |
| (sin HU antigua) `failureKind` ASSERTION/ERROR de CS-CORE-20261009-016 | HU13 | El Sandbox emite el hecho; la clasificación es de Core. |

Este mapa es una propuesta de homologación de la migración a SDD 3.1; los textos de las `spec.md` de las features conservan la numeración antigua como referencia histórica.

## Ideas diferidas

Residuales de la revisión independiente de WI-SANDBOX-010, sin urgencia y sin tocar el contrato HTTP. Cada una entra como `I-BACKLOGGED`; al seleccionarla se encaja en HU11 mediante un WI propio.

| ID | Idea | Origen |
| --- | --- | --- |
| I-SANDBOX-001 | Borrar o poner en cuarentena los archivos de estado inválidos y contarlos para la retención. | WI-010 · m3 |
| I-SANDBOX-002 | Limitar `removeTemporaryFiles` a los temporales propios y no aplicar `chmod 0700` a un directorio del operador. | WI-010 · m3 |
| I-SANDBOX-003 | `fsync` del directorio de estado tras el `rename` de cada escritura. | WI-010 · m4 |
| I-SANDBOX-004 | Esperar la reconciliación de contenedores huérfanos antes de escuchar, o filtrar por `Created` anterior al arranque. | WI-010 · m5 |
| I-SANDBOX-005 | Cota de admisión para la cola de concurrencia y las ejecuciones `PENDING`. | WI-010 · m6 |
| I-SANDBOX-006 | Pruebas del cableado de `sensitiveHostPaths` en el módulo y de incluir el directorio de estado entre las rutas redactadas. | WI-010 · n1, n2 |
| I-SANDBOX-007 | Ampliar la redacción a rutas con espacios, diferencias de mayúsculas, rutas Windows y esquemas distintos de http/https. | WI-010 · n3 |
| I-SANDBOX-008 | Derivar `TestCaseFactStatus` y `TestCaseFailureKind` del contrato generado y atar la excepción de 5 ciclos de revisión de `validate-harness.mjs` al WI correspondiente. | WI-011/012 · MINOR |
