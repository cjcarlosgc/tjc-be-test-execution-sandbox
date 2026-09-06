# Arquitectura

**Contratos compartidos:** SYSTEM-1.4 / INTEROP-1.5

`POST /executions -> validate request -> download ProjectVersion source.zip -> temp workspace -> safe extract -> write/merge generated tests -> detect runner/runtime -> Docker -> install deps -> compile/run tests -> capture structured JSON + stdout/stderr -> normalize -> cleanup container/workspace -> ExecutionResult`.

## Frontera

El Sandbox no consulta PostgreSQL/pgvector, no accede directamente a Supabase Storage, no hace retrieval, no llama al LLM y no recibe ningún campo de estrategia experimental (`RAG`, `GENERALIST_AGENT`, `BASELINE` u otro). Solo ejecuta el mismo contrato neutral para cualquier origen.

RAG Core le entrega `EphemeralDownloadRef` de vida corta. El proceso host descarga por HTTPS, verifica tamaño/hash y descarta la URL antes de iniciar el container. Ninguna signed URL, key, bucket o credencial entra al container. Sandbox devuelve el resultado por la API y Core lo persiste.

Todos los endpoints `/executions` están protegidos por `Authorization: Bearer` con un secreto opaco precompartido `SANDBOX_SERVICE_TOKEN`. La misma variable se inyecta en Core y Sandbox mediante configuración segura de host; no es JWT, no requiere proveedor de identidad y nunca entra al container. `/health/live` y `/health/ready` permanecen públicos.

`Idempotency-Key` debe ser UUID e igual a `requestId`. El Sandbox deduplica por identidad y huella lógica ignorando cambios de firma/expiración de la URL temporal: replay equivalente devuelve la ejecución original y payload distinto produce `409 IDEMPOTENCY_CONFLICT`.

## Docker

Usar Docker API vía `dockerode`, no shelling-out a `docker` CLI. Node version se toma de metadata indexada/engines cuando sea posible; fallback configurable. Montar workspace en `/app`.

El entorno temporal aprobado para desarrollo y prevalidación es la MacBook del desarrollador encendida, con Docker Desktop activo y su VM Linux proporcionando Docker Engine. El servicio debe seguir tratando el endpoint del motor como configuración y no asumir disponibilidad permanente del equipo local.

El destino previsto es una VM Linux remota con Docker Engine. `DEC-INF-001` mantiene PENDING la selección de un proveedor preferentemente gratuito y bloquea solo su aprovisionamiento. Docker Desktop local queda confirmado como suficiente para desarrollo/prevalidación durante Sprint 2-4; el proveedor remoto se revisita después de Sprint 4 y no se adopta un fallback automático si una opción gratuita falla. La imagen/runtime Node sigue siendo configurable; package manager del servicio y de proyectos ya fueron resueltos por `DEC-SBX-001`/`DEC-SBX-002`.

## Etapas

PREPARING -> INSTALLING_DEPENDENCIES -> COMPILING -> RUNNING_TESTS -> COMPLETED; errores se devuelven normalizados con stage/evidence.

## Seguridad operacional

Cada ejecución tiene límites de tiempo, CPU, RAM, almacenamiento temporal, procesos y output. El acceso de red se separa por etapa: la instalación puede requerir acceso acotado para dependencias; compilación y tests deben ejecutarse sin red cuando sea viable. No montar Docker socket dentro del container ni directorios innecesarios del host.

El servicio Sandbox no recibe por defecto `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` ni `DATABASE_PASSWORD`. Si en el futuro un worker necesitara PostgreSQL directo, esa decisión deberá aprobar un rol restringido; nunca se usará `postgres`. Para la validación empresarial, logs, paths y artefactos deben tratarse como potencialmente confidenciales.

Una ejecución es neutral y factual. HU23/autorreparación automática está descartada: si Core solicita después un retry manual, este llega como otra ejecución lógica con otra `requestId`; el Sandbox no conoce la razón ni intenta corregir código con LLM.
