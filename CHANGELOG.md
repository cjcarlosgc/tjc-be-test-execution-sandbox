# CHANGELOG

Todos los cambios notables de la línea base SDD se registran aquí. El contenido vigente vive en `spec/`; este archivo no reemplaza la especificación.

## [Unreleased]

- **SDD 1.6:** se consolida una línea base SDD homologada para los tres repositorios y se formaliza la política Git común: commits por cambio coherente con trazabilidad obligatoria `Refs: HU...`, revisión por work item y revisión consolidada documentada del sprint antes del push. `sddVersion` deja de tratarse como versión local independiente; `SYSTEM-*` e `INTEROP-*` conservan versionado propio. Un push anticipado exige la misma puerta y commit/push siguen requiriendo solicitud humana explícita.
- **SDD 1.2 / SYSTEM-1.1 / INTEROP-1.0:** se incorpora el contrato universal y se aprueba Core↔Sandbox como `POST /executions` asíncrono con polling, idempotencia, auth interna, correlación, `StorageObjectRef`, resultados factuales y evidencia por referencia. `DEC-INT-001` pasa a APROBADO; las decisiones de package managers permanecen PENDING.
- **SDD 1.1 / SYSTEM-1.0:** se incorpora la copia espejo del contrato canónico de los tres componentes, TypeScript-only para proyectos objetivo, Sandbox ciego a toda estrategia experimental y restricciones para validación en empresa real.
- Se aprueba Supabase Storage mediante `@supabase/supabase-js` detrás de `ObjectStorageService`; deja de estar pendiente el proveedor. El mecanismo Core↔Sandbox permanece PENDING en `DEC-INT-001`.
- El harness adopta `Blocks` y `decisionGate`. Se registran `DEC-SBX-001` para el package manager del servicio y `DEC-SBX-002` para la instalación de dependencias del proyecto, sin bloquear trabajo no relacionado.
- HU19 se actualiza de baseline aislado a agente generalista con exploración propia. Mutation score/StrykerJS permanece PENDING después del núcleo de Sprint 2.

## [1.0.0] - 2026-08-30

- Se crea la línea base SDD del proyecto.
- Se adopta `spec.md + plan.md + tasks.md` por feature.
- Se adopta `CHANGELOG.md` en lugar de enmiendas acumulativas dentro de las specs.
- Se conserva trazabilidad mediante `storyIds` y `sprint`.
- El código fuente se reserva para `app/`.
