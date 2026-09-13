# 009 — Tareas

## Baseline T-001

- [x] Adoptar SYSTEM-2.0 e INTEROP-2.0.
- [x] Definir profiles Node y PHP/PHPUnit manteniendo la frontera ciega.
- [x] Registrar backlog, state, changelog y reporte de revisión.

## Implementación posterior — requiere selección humana

- [x] HU43: DTO y resolución estricta del profile.
- [x] HU43: imagen PHP/Composer y adapter PHPUnit.
- [x] HU43: contract, integration y security tests.
- [ ] HU47: proveedor remoto, después de resolver `DEC-INF-001`.

Nota de verificación: el e2e real de `full-pipeline.e2e-spec.ts` para `PHP_LARAVEL_PHPUNIT` (Composer + PHPUnit reales contra Docker) quedó escrito pero no se corrió contra un daemon Docker real (no disponible en el entorno en el que se implementó); el resto (contrato, DTO, resolución estricta, adapter/parser JUnit, detección composer.json, registry) sí está verificado en verde con `vitest run` + `tsc --noEmit`.
