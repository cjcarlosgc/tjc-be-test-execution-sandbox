# Tech stack

**Estado:** aprobado salvo PENDING explícitos

- NestJS + TypeScript.
- Docker Engine/API mediante `dockerode`.
- Jest y Vitest adapters.
- JSON estructurado de runner cuando esté disponible; stdout/stderr como evidencia secundaria.
- HTTP interno desde RAG Core.
- Supabase Storage mediante `@supabase/supabase-js` para descargar snapshots/artefactos, encapsulado detrás de la abstracción interna `ObjectStorageService`.
- **PENDING (`DEC-SBX-001`):** package manager del propio servicio.
- Imagen/runtime Node seleccionable/configurable; no fijar una sola versión global para todos los proyectos.

TypeScript aparece en dos fronteras distintas: el Sandbox se implementa con NestJS + TypeScript y los proyectos ejecutados en V1 son exclusivamente TypeScript (`.ts`/`.tsx`) con Jest o Vitest. No aceptar JavaScript puro como proyecto compatible.

### DEC-SBX-001 — Package manager del servicio Sandbox

**Estado:** PENDING

**Blocks:** creación del scaffold y lockfile de `app/`; no bloquea refinamiento SDD ni contratos independientes del empaquetado

**Pregunta:** antes de crear `app/`, elegir el package manager del propio servicio y su política de lockfile. No confundirlo con el package manager detectado dentro de cada proyecto ejecutado.

### DEC-SBX-002 — Dependencias del proyecto ejecutado

**Estado:** PENDING

**Blocks:** implementación de instalación de dependencias en `004-container-execution`; no bloquea Execution API, Storage o workspace seguro

**Pregunta:** definir qué package managers/lockfiles de los proyectos TypeScript objetivo soporta V1, cómo se detectan y qué comando reproducible/offline-or-network se permite. No asumir que el package manager del Sandbox coincide con el del proyecto ejecutado.
