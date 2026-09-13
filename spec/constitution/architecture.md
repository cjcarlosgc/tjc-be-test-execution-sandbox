# Arquitectura

**Contratos compartidos:** SYSTEM-2.0 / INTEROP-2.0

`POST /executions -> validar profile/request -> descargar snapshot -> workspace seguro -> materializar tests -> container aislado -> instalar -> compilar si aplica -> ejecutar runner -> normalizar evidencia -> cleanup`.

`NODE_TYPESCRIPT` conserva pnpm y Jest/Vitest. `PHP_LARAVEL_PHPUNIT` usa Composer y PHPUnit. Profile y runner son explícitos; una combinación incompatible falla sin fallback.

Sandbox no recibe datos GitHub, identidad, prompts, chunks, conocimiento funcional ni variante experimental. Core entrega referencias efímeras; ninguna credencial o URL firmada entra al container. `SANDBOX_SERVICE_TOKEN`, idempotencia, límites, red por etapas, timeouts, redacción y cleanup continúan vigentes.

Sandbox reporta fase baseline/proposal y hechos de ejecución. Solo Core clasifica el `AnalysisRun`. El proveedor remoto sigue sujeto a `DEC-INF-001`; Docker Desktop local continúa como entorno de desarrollo, no como evidencia empresarial final.
