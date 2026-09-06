# Revisión de work item — 008-reliability-lifecycle (health/readiness)

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint. Cubre solo la porción `health/readiness` de `008-reliability-lifecycle`; el resto de la feature (lifecycle state formal, fault injection ampliada, programación automática del sweeper) queda como trabajo futuro identificado, sin decisión `PENDING` que lo bloquee.

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED` (alcance parcial, explícito en `tasks.md`)

## Alcance y trazabilidad

- Historias: HU14, HU19, HU23 (`spec/features/008-reliability-lifecycle/spec.md`).
- Sin decisiones `PENDING` bloqueantes.
- Implementado — `GET /health/live` y `GET /health/ready` (INTEROP-1.1 §7.5):
  - `/health/live`: `200 {status:'ok', timestamp}` siempre; no consulta ninguna dependencia (proceso activo).
  - `/health/ready`: evalúa en paralelo tres checks independientes — Docker (`docker.ping()` reutilizando el mismo `DOCKER_CLIENT` de `004-container-execution`, ahora exportado por `ContainerModule`), política de descarga (`SANDBOX_ALLOWED_DOWNLOAD_HOSTS` no vacío — una allowlist vacía significa que ninguna ejecución podría completarse nunca) y workspace (raíz de `002-project-workspace` escribible). `200 {status:'ready', checks:{...}}` si los tres están bien; `503` (vía `AppHttpException`/`ErrorEnvelope`, código `SANDBOX_NOT_READY`) en caso contrario, con el mismo detalle de checks en `details`.
  - Ninguno de los dos endpoints exige `Authorization: Bearer` — decisión de diseño explícita: son endpoints de infraestructura (orquestador/balanceador) que no ejecutan código del proyecto ni exponen datos sensibles; solo devuelven `ok`/`unavailable` genéricos, nunca hostnames de la allowlist, rutas del host más allá de lo ya público, ni mensajes de error internos (verificado en el test e2e que el cuerpo de la respuesta nunca contiene el host configurado).
- Se reutiliza intencionalmente infraestructura ya construida en vez de duplicarla: el check de Docker no crea un container (evitaría probes lentos/costosos); solo hace `ping()`.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 90/90 verdes, incluyendo `health.service.spec.ts` (live no toca dependencias; ready con los tres checks en verde; Docker inalcanzable → `not_ready` sin filtrar el mensaje de error real; allowlist vacía → `not_ready`).
- `pnpm test:e2e`: 11/11 verdes, incluyendo un archivo nuevo `health.e2e-spec.ts` contra la app completa (sin auth, formas de respuesta correctas, `503` vía `AppHttpException` cuando corresponde, y el host configurado nunca aparece en el cuerpo de la respuesta). Ejecutado con Docker Desktop activo en esta sesión: `/health/ready` reporta `docker.status=ok` contra el daemon real.

## Manejo de errores y seguridad

- `/health/ready` en estado no listo reutiliza el mismo `ErrorEnvelope` centralizado que el resto de la API (vía `AppHttpException` + `HttpExceptionFilter`), sin un formato paralelo.
- Ningún check revela secretos, tokens, URLs firmadas ni la lista completa de hosts permitidos; solo `ok`/`unavailable` + un mensaje genérico fijo.

## Observabilidad mínima

- No se agregó logging adicional: los checks son de bajo costo y su resultado ya es la respuesta HTTP consultada por el probe; no hay contenido sensible que redactar.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
