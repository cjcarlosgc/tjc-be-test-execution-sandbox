# T-003 — Validación PHP/Laravel utilizable como evidencia (HU43)

**Work item:** `T-003-php-laravel-validation` · **Rama:** `feature/php-profile` (desde `develop`)
**Spec:** `spec/features/009-execution-profiles/spec.md` § Corte T-003
**Commits:** `8e76632` (implementación), `1630d45` (hallazgos de revisión)
**Estado:** `DONE` — revisión independiente aprobada (ver `harness/reports/delivery-php-profile-review.md`).

## Motivo

La validación empresarial y el piloto de la tesis son PHP/Laravel/PHPUnit. El corte 3 ya ejecutaba PHPUnit real, pero:

1. ejecutaba toda la suite del proyecto, así que un test previo rojo o un Feature test sin BD invalidaba el test generado;
2. no distinguía un error técnico (`<error>`) de una aserción fallida (`<failure>`);
3. no preparaba el entorno Laravel (`APP_KEY`) y ejecutaba `apt-get` en cada instalación con capabilities extra;
4. un JUnit vacío (PHPUnit 11 ante un error de sintaxis) terminaba como `COMPLETED` con 0 tests.

## Cambios

Ver la entrada HU43 (corte T-003) de `CHANGELOG.md`. En resumen: imagen gestionada `tjc-sandbox-php:8.3`, `composer install --no-scripts`, `APP_ENV`/`APP_KEY` en el container de tests, `phase` opcional con selección de tests por artefactos, `TestCaseFact.failureKind`, `TEST_COMPILATION_FAILED`, borrado del reporte previo, memoria por defecto de 1 GiB e `IMAGE_UNAVAILABLE`.

## Evidencia

| Verificación | Resultado |
|---|---|
| `pnpm lint` (oxlint) | 0 warnings, 0 errores |
| `tsc --noEmit -p tsconfig.build.json` | sin errores |
| `pnpm test` (unit) | 182/182 (antes 151) |
| `pnpm test:e2e` (Docker API real vía socket de Podman 5.8 rootless) | 20/20 (antes 18) |
| Corrida real contra `dannykim2023/SVADN2.0` (Laravel 12.52, PHPUnit 11.5), 3 artefactos generados | `COMPLETED`; 5/5 tests; solo se ejecutaron los generados (no los `ExampleTest`); install 8,1 s, tests 0,7 s |
| Containers `sandbox-*` residuales tras la suite | 0 |

Hechos verificados contra PHPUnit 11.5 real antes de implementar:

- acepta varias rutas de test como argumentos posicionales;
- JUnit: `<failure type="PHPUnit\Framework\ExpectationFailedException">` frente a `<error type="Error">`;
- ante un error de sintaxis en un archivo de test: exit 255, JUnit de 0 bytes y el motivo (`syntax error, unexpected ...`) en stdout.

La corrida contra SVADN2.0 también mostró que `RefreshDatabase` con SQLite `:memory:` funciona en ese proyecto: la migración que repite la columna `total` no rompe una base limpia.

## Notas de entorno

- Con Podman rootless (y con Docker en Linux sin userns), un usuario no-root del container no puede leer el workspace `0700` del host. Para desarrollo local se usa `SANDBOX_CONTAINER_USER=root`, que en rootless equivale al usuario del host. Para la VM remota queda pendiente el mapeo de UID (HU47).
- Con SELinux en modo enforcing, la raíz de workspaces debe tener la etiqueta `container_file_t`.
- `scripts/sdd-check.mjs` ya fallaba en `develop` antes de este corte (`schemaVersion no soportado`: no reconoce el `schemaVersion: 3` del harness V2). Queda sin cambios.

## Impacto contractual

- `phase` ya existe en INTEROP §7.2; el Sandbox lo acepta como opcional mientras Core no lo envíe.
- `TestCaseFact.failureKind` es un campo aditivo nuevo: requiere `CONTRACT_SYNC` hacia Core (dueño canónico de INTEROP) y revisión de `contract-reviewer`.
- Core sigue usando `facts.passed` y no envía `phase`. Para aprovechar el corte, Core debe enviar `phase` y mapear `failureKind` (`ERROR` → fallo técnico, `ASSERTION` → posible `BEHAVIORAL_MISMATCH`).

## Revisión independiente

- `reviewer`: APPROVED sobre `8e76632` (7 hallazgos no bloqueantes) y APPROVED sobre el rango `develop..1630d45` tras aplicar 4 de ellos.
- `contract-reviewer`: APPROVED sobre `8e76632`, sin bloqueantes; su propuesta de CONTRACT_SYNC se publicó como `CS-SANDBOX-20261009-001` (`--source-revision 1630d45`). `1630d45` no cambia DTOs, campos ni categorías.

## Diferidos a un corte posterior (aceptados en revisión)

1. `composer install --no-plugins`: los plugins permitidos por el proyecto ejecutan código durante la etapa con red (HU47 / `DEC-INF-001`).
2. Anclar los filtros posicionales de Vitest (hoy son substring y podrían seleccionar archivos no generados).
3. Fijar `php:8.3-cli` y `composer:2` por digest en `app/docker/php/Dockerfile`.
4. Timeout del build/pull de imagen, descontado del deadline de la ejecución (HU47 / `DEC-INF-001`).
5. Reforzar el test de "artefacto fuera del proyecto envuelto" con un snapshot envuelto real (hoy la aserción puede cumplirse por la validación previa de rutas).

## Fuera de alcance

Persistencia del repositorio de ejecuciones, límite de concurrencia, reconciliación de containers huérfanos, mapeo de UID y filtrado de red para la VM (HU47 / `DEC-INF-001`), y nombrar los tests relevantes del baseline (requiere cambio de contrato en Core).
