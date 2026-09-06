# Revisión de work item — 002-project-workspace + 003-test-materialization

**Fecha:** 2026-09-06

**Tipo:** revisión de work item (`IN_REVIEW` → `DONE`), no cierre de sprint

**Componente:** Test Execution Sandbox

**Veredicto:** `APPROVED`

## Alcance y trazabilidad

- Historias: HU08, HU09, HU10, HU11, HU12, HU14, HU19 (mismas que `001-execution-api`, comparten spec de dependencias).
- Decisiones: ninguna `PENDING` alcanza a `002`/`003` (`DEC-SBX-002` solo bloquea instalación de dependencias en `004-container-execution`, verificado explícitamente contra su `Blocks`).
- Implementado:
  - **002-project-workspace:** `WorkspaceManager` (directorio efímero por `executionId` bajo raíz configurada, `resolveWithin` como defensa en profundidad, `cleanup`, `sweepExpired` por TTL), `HttpExecutionInputDownloadService` (HTTPS-only, host permitido por configuración, expiración, timeout, reintentos acotados excluyendo errores de política/integridad, redirects acotados y revalidados por host, verificación `sha256`/`sizeBytes`), `SafeArchiveExtractor` (`yauzl`: rechaza Zip Slip, rutas absolutas, symlinks, límites de entradas/tamaño total/tamaño por entrada/ratio de compresión).
  - **003-test-materialization:** `ArtifactMaterializer` descarga cada artefacto (`CREATED`/`MODIFIED`) y lo escribe en su `relativePath` validado dentro del workspace; no modifica el snapshot original; trata el conjunto de artefactos recibido como el conjunto final ya resuelto por Core (sin lógica de merge en Sandbox, conforme al plan).
  - **Integración:** `ExecutionPipelineService` conecta `001` con `002`/`003`: al aceptar una ejecución (sin bloquear el `202`), en segundo plano crea el workspace, descarga y extrae el snapshot, materializa artefactos. Éxito deja `status=stage=PREPARING` (etapas siguientes dependen de `DEC-SBX-002` y de `004`/`005`, no implementadas); fallo produce `FAILED` con `SandboxFailureFact` factual y limpia el workspace.
- Fuera de alcance (correctamente diferido): instalación de dependencias, compilación, ejecución de runner (`004`/`005`/`006`); programación automática del sweeper (queda para `008-reliability-lifecycle`); persistencia de progreso granular dentro de `PREPARING` (el contrato solo expone `PENDING`/`SandboxStage`, no hay campo adicional que inventar).
- No se tocó código de otras features ni se amplió alcance.

## Verificaciones ejecutadas (en `app/`)

- `pnpm lint` (oxlint): sin hallazgos.
- `pnpm build` (`nest build`): sin errores.
- `pnpm test` (vitest, unit): 62/62 verdes, incluyendo:
  - `download-policy.spec.ts`: https-only, allowlist, expiración, URL malformada.
  - `stream-to-file.spec.ts`: hash/tamaño correctos, corte al exceder el límite.
  - `workspace-manager.spec.ts`: creación, `resolveWithin` (incluye escape), cleanup, sweeper por TTL con mtime real.
  - `safe-archive-extractor.spec.ts`: extracción normal, Zip Slip, ruta absoluta, symlink, límite de entradas, límite de tamaño por entrada — usando ZIPs reales construidos con `yazl` (Zip Slip/absoluto vía parcheo de bytes post-construcción, ya que `yazl` valida y rechaza esos nombres al crear el archivo).
  - `execution-input-download.service.spec.ts`: descarga exitosa, integridad fallida sin reintento, reintento ante fallo transitorio, redirect a host permitido, redirect a host no permitido sin reintento.
  - `artifact-materializer.spec.ts`: escritura CREATED anidada, rechazo de traversal, sobrescritura MODIFIED, lista vacía.
  - `execution-pipeline.service.spec.ts`: éxito queda en PREPARING, fallo de descarga produce `SandboxFailureFact` + cleanup, error inesperado clasifica `UNKNOWN` + cleanup, aplica artefactos, no-op si el registro desapareció.
- `pnpm test:e2e` (vitest + supertest, app completa): 8/8 verdes, incluyendo dos casos de integración real:
  - Host de descarga no permitido → `FAILED` con `failure.code=INPUT_DOWNLOAD_FAILED`, `category=CONFIGURATION`, consultable en `GET /result`.
  - Descarga real por HTTPS (servidor local con certificado autofirmado) de un ZIP construido con `yazl`, extracción real y materialización real de un artefacto generado; se verifica el contenido final en disco (`package.json` extraído y `src/generated.spec.ts` materializado).

## Manejo de errores y seguridad

- `assertDownloadPolicy` falla cerrado: allowlist vacía rechaza toda descarga.
- Reintentos excluyen explícitamente errores de categoría `CONFIGURATION` e `IntegrityCheckFailedError` (no tiene sentido reintentar una política rechazada o un hash inválido).
- `SafeArchiveExtractor` rechaza entradas symlink por bit de modo Unix en `externalFileAttributes`, y aplica límites independientes de entradas, tamaño total, tamaño por entrada y ratio de compresión antes de escribir cualquier byte de una entrada excesiva.
- `WorkspaceManager.resolveWithin` es una segunda defensa (además de `IsRelativePath` en el DTO) para cualquier ruta relativa antes de escribir.
- Los códigos de error siguen el vocabulario de `INTEROP-1.1` §7.4 (`INPUT_URL_EXPIRED`, `INPUT_DOWNLOAD_FAILED`, `INTEGRITY_CHECK_FAILED`, `INVALID_ARCHIVE`, `INVALID_ARTIFACT_PATH`) y nunca se convierten en HTTP 5xx tras el `202` (se persisten como resultado factual, conforme a `errors` transversal).

## Observabilidad mínima

- El pipeline registra transición a `PREPARING`, éxito (workspace + cantidad de artefactos aplicados) y fallo (`code`/`message`) sin registrar URLs firmadas completas ni contenido descargado.
- `HttpExecutionInputDownloadService` registra únicamente el motivo del fallo por intento, nunca la URL firmada ni tokens de query string.

## Hallazgos

Ninguno abierto.

## Pendiente antes de publicar

Commit y push siguen requiriendo solicitud humana explícita.
