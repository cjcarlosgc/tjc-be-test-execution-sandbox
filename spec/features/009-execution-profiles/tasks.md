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

## Corte T-003 — Validación PHP/Laravel (HU43)

- [x] Imagen PHP gestionada (Dockerfile + build si falta) y sin `apt-get`/`capAdd` en la instalación.
- [x] `composer install --no-scripts` y entorno de testing Laravel (`APP_ENV`, `APP_KEY`).
- [x] `phase` opcional y selección de tests por artefactos (PHPUnit, Jest, Vitest).
- [x] `failureKind` en parsers JUnit y Jest-compatible.
- [x] Reporte ausente o vacío nunca es COMPLETED; `TEST_COMPILATION_FAILED` ante error de sintaxis PHP.
- [x] Borrar archivo de resultados previo a la ejecución.
- [x] Default de memoria 1 GiB.
- [x] Unit + e2e real en verde; reporte en `harness/reports/`.
- [x] `CONTRACT_SYNC` publicado hacia Core.

## WI-SANDBOX-001 — `projectRoot` Core→Sandbox (HU43)

- [x] **ST-SANDBOX-004 · T-READY · WI-SANDBOX-001 · HU43:** validar `projectRoot` dentro de `repositoryRoot`, usarlo como cwd de Composer/PHPUnit y mantener artifacts repo-relative según INTEROP-2.8; omisión legacy equivale a `.`. No detectar ni seleccionar proyectos en Sandbox. Evidencia: `harness/reports/wi-sandbox-001-project-root.md`.

## Próximo corte local — identidad de ejecución PHP (HU43)

- [x] **ST-SANDBOX-005 · T-READY · WI-SANDBOX-002 · HU43:** containers PHP con identidad Unix no-root obligatoria `sandbox` (UID/GID 10001), sin `chown` manual por ejecución; `CapDrop: ['ALL']`, `no-new-privileges`, red solo durante instalación y aislamiento del workspace. El named volume de **caché** Composer se inicializa una vez, recursivamente y sin red para dar ownership al usuario no-root, sin descargar ni copiar el binario. Evidencia: `harness/reports/wi-sandbox-002-implementation.md`, 194 pruebas unitarias y E2E Docker (21); revisión independiente excepcional final APPROVED. Sin VM, GCE, despliegue ni Contract Sync.

## Corte técnico de permisos del workspace — HU11

- [x] **WI-SANDBOX-005 · T-READY · `storyIds: ["HU11"]`:** conceder con ACL acceso mínimo del UID PHP 10001 al workspace de su ejecución y conservar la capacidad host de leer/limpiar. Cubre herencia, aislamiento entre workspaces, cambios de modo por contenido no confiable y fallo seguro si falta el soporte ACL. Prerequisito operativo `setfacl`/paquete `acl` en Linux; no se instala en la VM dentro de este corte. Sin cambio de API/contratos, SDD 2.1 ni SYSTEM-2.2.

## WI-SANDBOX-004 — registro Harness del E2E remoto fallido

- [x] Registrar los intentos autorizados, el fallo HTTP 401 previo y la ejecución aceptada que falló al instalar dependencias; no declarar éxito ni repetir el POST. Evidencia reconciliada: `harness/reports/wi-sandbox-004-remote-e2e-authorization.md`.
