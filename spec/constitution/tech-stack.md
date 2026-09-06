# Tech stack

**Estado:** aprobado salvo PENDING explícitos

- NestJS + TypeScript.
- Docker Engine/API mediante `dockerode`.
- Jest y Vitest adapters.
- JSON estructurado de runner cuando esté disponible; stdout/stderr como evidencia secundaria.
- HTTP interno desde RAG Core.
- Cliente HTTP inyectable para descargar únicamente las URLs HTTPS temporales declaradas en `EphemeralDownloadRef`; este repositorio no incorpora `@supabase/supabase-js` ni conoce bucket o keys.
- `pnpm` es el package manager del propio servicio Sandbox (`DEC-SBX-001`, APROBADO); `pnpm-lock.yaml` se versiona en el repositorio.
- Imagen/runtime Node seleccionable/configurable; no fijar una sola versión global para todos los proyectos.
- Entorno temporal: Docker Desktop en la MacBook encendida del desarrollador, usando su VM Linux para los containers de ejecución.
- Destino previsto: VM Linux remota con Docker Engine; proveedor preferentemente gratuito sujeto a `DEC-INF-001`, cuya selección se revisita después de Sprint 4. Docker Desktop local es suficiente para desarrollo/prevalidación de Sprint 2-4.

TypeScript aparece en dos fronteras distintas: el Sandbox se implementa con NestJS + TypeScript y los proyectos ejecutados en V1 son exclusivamente TypeScript (`.ts`/`.tsx`) con Jest o Vitest. No aceptar JavaScript puro como proyecto compatible.

### DEC-SBX-001 — Package manager del servicio Sandbox

**Estado:** APROBADO

**Decisión:** el servicio Sandbox usa `pnpm` como package manager; `pnpm-lock.yaml` se genera y se versiona en el repositorio como fuente de reproducibilidad. No se confunde con el package manager detectado dentro de cada proyecto ejecutado (`DEC-SBX-002`, aún PENDING).

### DEC-SBX-002 — Dependencias del proyecto ejecutado

**Estado:** PENDING

**Blocks:** implementación de instalación de dependencias en `004-container-execution`; no bloquea Execution API, descarga efímera o workspace seguro

**Pregunta:** definir qué package managers/lockfiles de los proyectos TypeScript objetivo soporta V1, cómo se detectan y qué comando reproducible/offline-or-network se permite. No asumir que el package manager del Sandbox coincide con el del proyecto ejecutado.
