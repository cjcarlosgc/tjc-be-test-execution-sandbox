# 009 — Tareas

## Baseline T-001

- [x] Adoptar SYSTEM-2.1 e INTEROP-2.1.
- [x] Definir profiles Node y PHP/PHPUnit manteniendo la frontera ciega.
- [x] Registrar backlog, state, changelog y reporte de revisión.

## Implementación posterior — requiere selección humana

- [x] HU43: DTO y resolución estricta del profile.
- [x] HU43: imagen PHP/Composer y adapter PHPUnit.
- [x] HU43: contract, integration y security tests.
- [ ] HU47: proveedor remoto, después de resolver `DEC-INF-001`.

Nota de verificación: el e2e real de `full-pipeline.e2e-spec.ts` para `PHP_LARAVEL_PHPUNIT` (Composer + PHPUnit reales contra Docker) se corrió contra un daemon Docker real y quedó en verde, junto con el resto de la suite (`vitest run` + `tsc --noEmit`). El `php:8.3-cli` (Debian) base no trae `unzip`/`ext-zip`, necesarios para que Composer extraiga paquetes; el install del profile PHP instala `unzip` vía `apt-get` en cada ejecución (sin imagen custom), lo que exige `CapAdd: ['CHOWN','FOWNER','DAC_OVERRIDE']` y `-o APT::Sandbox::User=root` para operar bajo el `CapDrop: ['ALL']` base — confirmado en Docker real, ver `container-runner.service.ts`.
