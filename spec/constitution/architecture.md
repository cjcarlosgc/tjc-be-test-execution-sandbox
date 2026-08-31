# Arquitectura

`POST /executions -> validate request -> download ProjectVersion source.zip -> temp workspace -> safe extract -> write/merge generated tests -> detect runner/runtime -> Docker -> install deps -> compile/run tests -> capture structured JSON + stdout/stderr -> normalize -> cleanup container/workspace -> ExecutionResult`.

## Frontera

El Sandbox no consulta pgvector, no hace retrieval, no llama al LLM y no recibe `strategy=RAG|BASELINE`.

## Docker

Usar Docker API vía `dockerode`, no shelling-out a `docker` CLI. Node version se toma de metadata indexada/engines cuando sea posible; fallback configurable. Montar workspace en `/app`.

## Etapas

PREPARING -> INSTALLING_DEPENDENCIES -> COMPILING -> RUNNING_TESTS -> COMPLETED; errores se devuelven normalizados con stage/evidence.

## Seguridad operacional

Cada ejecución tiene límites y un deadline global. El acceso de red debe ser mínimo: V1 puede requerir red para `npm ci`; la fase de ejecución debería poder restringirse cuando el entorno lo permita. No montar Docker socket dentro del container.
