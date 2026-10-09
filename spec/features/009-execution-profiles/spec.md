# 009 — Execution profiles

**Estado:** APROBADO
**Story IDs:** HU43
**Contrato:** SYSTEM-2.2 / INTEROP-2.2

## Objetivo

Ejecutar solicitudes neutrales mediante un profile explícito, preservando `NODE_TYPESCRIPT` y agregando soporte real `PHP_LARAVEL_PHPUNIT` sin introducir conocimiento de GitHub, RAG o reglas funcionales.

## Reglas

- `ExecutionRequest.executionProfile` selecciona runtime y `testRunner`; no se infiere silenciosamente un stack incompatible.
- `NODE_TYPESCRIPT` conserva pnpm, Jest/Vitest y el aislamiento vigente.
- `PHP_LARAVEL_PHPUNIT` exige `composer.json`; usa `composer.lock` cuando exista, instala de forma reproducible y ejecuta PHPUnit con salida estructurada o evidencia normalizada.
- El container, límites, red por etapas, timeouts, redacción, hashes y cleanup se aplican a ambos profiles.
- Baseline y propuesta son fases neutrales. Sandbox devuelve hechos; Core decide la clasificación.
- Una combinación profile/runner no soportada falla explícitamente, sin fallback a otro runtime.

## Frontera ciega

Sandbox no recibe GitHub installation/repository/PR, identidad humana, prompts, chunks, Functional Knowledge, variante experimental ni política de publicación. Recibe snapshot, tests/materialización, targets técnicos y referencias de evidencia.

## Fuera de alcance T-001

La implementación Docker/PHP, imágenes y adapter PHPUnit pertenecen a HU43 posterior. El proveedor remoto permanece bloqueado solo por `DEC-INF-001`.

## Corte T-003 — Validación PHP/Laravel utilizable como evidencia (HU43)

**Estado:** APROBADO por el usuario (2026-10-09) para implementar en `feature/php-profile`.
**Motivo:** la validación empresarial y el piloto experimental son PHP/Laravel/PHPUnit. El corte 3 ejecuta PHPUnit real, pero sus hechos no distinguen el test generado del resto de la suite ni un error técnico de un fallo de aserción, y el entorno Laravel no queda preparado.

Referencia de stack verificada en un repositorio autorizado (Laravel 12, PHP ^8.2, PHPUnit 11, `composer.lock`, SQLite `:memory:` en `phpunit.xml`): las extensiones exigidas por su lock están todas incluidas en la imagen oficial `php:8.3-cli`; no versiona `.env.example`.

### Reglas

1. **Imagen PHP propia del Sandbox.** El profile usa una imagen gestionada por el Sandbox (`php:8.3-cli` + `unzip` + Composer 2), construida desde un Dockerfile versionado en `app/` la primera vez que falte en el host. La instalación deja de ejecutar `apt-get` y deja de añadir capabilities sobre `CapDrop: ['ALL']`. Imagen y versión siguen siendo configuración (`SANDBOX_DEFAULT_PHP_IMAGE`).
2. **Instalación PHP.** `composer install --no-interaction --no-progress --prefer-dist --no-scripts`: respeta `composer.lock` cuando existe y no ejecuta scripts del proyecto durante la etapa con red. Laravel regenera su manifest de paquetes al arrancar los tests.
3. **Entorno Laravel de testing.** El container de tests del profile PHP recibe `APP_ENV=testing` y un `APP_KEY` aleatorio por ejecución (`base64:` + 32 bytes), sin red. Es política del profile, no un parámetro del request; las variables que fije `phpunit.xml` del proyecto se respetan.
4. **Selección de tests por fase.** `phase` (INTEROP §7.2) se acepta como opcional con default `GENERATED_TESTS` mientras Core no lo envíe:
   - `GENERATED_TESTS` con artefactos: el runner ejecuta únicamente las rutas de los artefactos materializados, resueltas relativas al proyecto (PHPUnit y Vitest: rutas como argumentos; Jest: `--runTestsByPath`).
   - `GENERATED_TESTS` sin artefactos y `BASELINE`: se ejecuta la suite configurada del proyecto. Limitación documentada: el contrato aún no permite a Core nombrar los "tests relevantes" del baseline.
   - `BASELINE` con artefactos se rechaza como `VALIDATION_ERROR`.
5. **Tipo de fallo por caso.** `TestCaseFact` agrega `failureKind: 'ASSERTION' | 'ERROR' | null` (null si no falló). PHPUnit: `<failure>` → `ASSERTION`, `<error>` → `ERROR`. Jest: `failureDetails[].matcherResult` o mensaje `Error: expect(` → `ASSERTION`. Vitest: mensaje `AssertionError` → `ASSERTION`. Cualquier otro fallo → `ERROR`. Es un campo aditivo: se notifica a Core por `CONTRACT_SYNC` (Core es el dueño canónico de INTEROP) y el Sandbox no clasifica la ejecución.
6. **Reporte ausente o vacío.** PHPUnit 11 deja el JUnit vacío (0 bytes) cuando no puede cargar un archivo de test y escribe el motivo en stdout (verificado). Un reporte ausente o vacío nunca es `COMPLETED`: si la salida del profile PHP contiene un error de sintaxis de PHP (`syntax error, unexpected`, `Parse error`, `ParseError`) la falla es `TEST_COMPILATION_FAILED` / `COMPILATION`; en otro caso, `TEST_EXECUTION_FAILED` / `TEST_RUNTIME`.
7. **Reporte limpio.** Antes de ejecutar el runner se elimina cualquier archivo de resultados preexistente en el workspace, para no leer un reporte que no produjo esta ejecución.
8. **Límites.** El límite de memoria por defecto del container pasa de 256 MiB a 1 GiB (Composer/pnpm de proyectos reales); sigue siendo configuración del Sandbox.

### Fuera de este corte

Persistencia del repositorio de ejecuciones, límite de concurrencia, reconciliación de containers huérfanos, mapeo de UID y filtrado de red para la VM remota (HU47/`DEC-INF-001`), y nombrar tests relevantes del baseline (requiere cambio de contrato en Core).
