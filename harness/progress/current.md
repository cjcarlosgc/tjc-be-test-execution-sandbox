# Progreso actual

SDD 1.2 / SYSTEM-1.1 / INTEROP-1.0 sincronizada. No existe implementación en `app/` todavía.

SDD 1.6 queda homologada como línea base conjunta de los tres repositorios y formaliza la entrega Git común: cada commit es un cambio coherente con `Refs: HU...`; cada work item conserva su revisión y, antes del push de cierre de sprint, el reviewer debe aprobar y documentar el rango acumulado exacto que se publicará. `SYSTEM-*` e `INTEROP-*` conservan versionado propio. Commit y push continúan requiriendo solicitud humana explícita.

Quedaron aprobados el alcance TypeScript-only, la neutralidad experimental del Sandbox, Supabase Storage vía `@supabase/supabase-js` detrás de `ObjectStorageService` y las restricciones para validación empresarial. `DEC-INT-001` queda aprobado mediante el contrato asíncrono universal; `DEC-SBX-001` aún bloquea el scaffold hasta elegir package manager y `DEC-SBX-002` bloquea la instalación de dependencias del proyecto hasta fijar compatibilidad. Mutation score/StrykerJS permanece PENDING y no bloquea Jest/Vitest ordinario.
