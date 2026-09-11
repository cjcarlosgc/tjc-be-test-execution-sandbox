# Tech stack

**Estado:** aprobado salvo PENDING explícitos

- NestJS + TypeScript.
- Docker Engine/API mediante `dockerode`.
- Jest y Vitest adapters.
- JSON estructurado de runner cuando esté disponible; stdout/stderr como evidencia secundaria.
- HTTP interno desde RAG Core.
- `SANDBOX_SERVICE_TOKEN` como secreto opaco precompartido para Bearer en `/executions`; se valida al arranque, no es JWT y no entra al container. Health permanece público.
- Cliente HTTP inyectable para descargar únicamente las URLs HTTPS temporales declaradas en `EphemeralDownloadRef`; este repositorio no incorpora `@supabase/supabase-js` ni conoce bucket o keys.
- `pnpm` es el package manager del propio servicio Sandbox (`DEC-SBX-001`, APROBADO); `pnpm-lock.yaml` se versiona en el repositorio.
- V1 solo soporta `pnpm` como package manager de los proyectos ejecutados (`DEC-SBX-002`, APROBADO), detectado por la presencia de `pnpm-lock.yaml` en el snapshot; la instalación se invoca vía `corepack pnpm@<versión fijada por configuración>` con red acotada a esa etapa.
- Imagen/runtime Node seleccionable/configurable; no fijar una sola versión global para todos los proyectos.
- Entorno temporal: Docker Desktop en la MacBook encendida del desarrollador, usando su VM Linux para los containers de ejecución.
- Destino previsto: VM Linux remota con Docker Engine; proveedor preferentemente gratuito sujeto a `DEC-INF-001`, cuya selección se revisita después de Sprint 4. Docker Desktop local es suficiente para desarrollo/prevalidación de Sprint 2-4.

TypeScript aparece en dos fronteras distintas: el Sandbox se implementa con NestJS + TypeScript y los proyectos ejecutados en V1 son exclusivamente TypeScript (`.ts`/`.tsx`) con Jest o Vitest. No aceptar JavaScript puro como proyecto compatible.

### DEC-SBX-001 — Package manager del servicio Sandbox

**Estado:** APROBADO

**Decisión:** el servicio Sandbox usa `pnpm` como package manager; `pnpm-lock.yaml` se genera y se versiona en el repositorio como fuente de reproducibilidad. No se confunde con el package manager detectado dentro de cada proyecto ejecutado (`DEC-SBX-002`).

### DEC-SBX-002 — Dependencias del proyecto ejecutado

**Estado:** APROBADO

**Decisión:** V1 soporta únicamente `pnpm` como package manager de los proyectos TypeScript ejecutados. Se detecta por la presencia de `pnpm-lock.yaml` en el snapshot ya extraído; un proyecto sin ese lockfile se rechaza como `UNSUPPORTED_PACKAGE_MANAGER` (422 antes de aceptar cuando sea detectable; resultado `FAILED`/`CONFIGURATION` si ocurre después del `202`, conforme `INTEROP-1.6` §7.4) sin intentar instalar nada. El comando reproducible es `corepack pnpm@<versión>` (nunca el campo `packageManager` del propio proyecto, que en la práctica trae rangos como `^9.0.0` que corepack rechaza por no ser semver exacto) seguido de `install --frozen-lockfile`; la versión de pnpm la fija la configuración del Sandbox (`SANDBOX_PNPM_VERSION`), no el proyecto. La instalación tiene acceso de red acotado a esa única etapa (ya aprobado en `architecture.md`); compilación y ejecución de tests corren sin red.
