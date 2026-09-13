# Tech stack

**Estado:** APROBADO salvo PENDING explícitos

- NestJS + TypeScript para el servicio.
- Docker Engine/API mediante `dockerode`.
- `NODE_TYPESCRIPT`: pnpm fijado por configuración y Jest/Vitest.
- `PHP_LARAVEL_PHPUNIT`: Composer, `composer.lock` cuando exista y PHPUnit.
- JSON estructurado del runner; stdout/stderr acotados como evidencia secundaria.
- HTTP interno autenticado desde Core mediante `SANDBOX_SERVICE_TOKEN`.
- cliente HTTP inyectable para referencias efímeras; sin SDK ni credenciales Supabase.

La instalación puede usar red acotada; compilación y tests corren sin red. Runtime, imagen y límites son configuración del Sandbox. El proveedor remoto permanece `PENDING` bajo `DEC-INF-001`.
