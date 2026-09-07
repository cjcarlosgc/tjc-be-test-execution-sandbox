# container-isolation — Tareas

- [x] Docker security options. — `Privileged: false`, `CapDrop: ['ALL']`, `SecurityOpt: ['no-new-privileges']`, usuario no-root (`SANDBOX_CONTAINER_USER`, default `node`), sin montar el socket de Docker.
- [x] mount policy. — un único bind mount del workspace en `/app`; solo lectura para el smoke check, lectura-escritura para instalación/tests (necesitan escribir `node_modules`/resultados); nunca la raíz del host ni directorios ajenos.
- [x] network policy. — `NetworkMode: 'none'` para el smoke check y la ejecución de tests; `NetworkMode: 'bridge'` únicamente durante `installDependencies` (acceso al registro pnpm).
- [x] security regression tests. — `container-runner.service.spec.ts` fija por aserción `HostConfig` completo (Binds/Memory/NanoCpus/PidsLimit/NetworkMode/Privileged/CapDrop) para smoke, install y test; cualquier regresión que afloje un límite rompe el test.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
