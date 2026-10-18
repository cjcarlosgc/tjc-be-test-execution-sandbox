# 009 — Execution profiles

**Estado:** APROBADO
**Story IDs:** HU11 (perfil PHP/Laravel; antes HU43 en SDD 2.1)
**Contrato:** SYSTEM-2.2 (línea base Sandbox) / INTEROP-2.8 (campo Core→Sandbox `projectRoot`)

## Objetivo

Ejecutar solicitudes neutrales mediante un profile explícito, preservando `NODE_TYPESCRIPT` y agregando soporte real `PHP_LARAVEL_PHPUNIT` sin introducir conocimiento de GitHub, RAG o reglas funcionales.

## Reglas

- `ExecutionRequest.executionProfile` selecciona runtime y `testRunner`; no se infiere silenciosamente un stack incompatible.
- `NODE_TYPESCRIPT` conserva pnpm, Jest/Vitest y el aislamiento vigente.
- `PHP_LARAVEL_PHPUNIT` exige `composer.json`; usa `composer.lock` cuando exista, instala de forma reproducible y ejecuta PHPUnit con salida estructurada o evidencia normalizada.
- El container, límites, red por etapas, timeouts, redacción, hashes y cleanup se aplican a ambos profiles.
- Baseline y propuesta son fases neutrales. Sandbox devuelve hechos; Core decide la clasificación.
- Una combinación profile/runner no soportada falla explícitamente, sin fallback a otro runtime.
- `CreateSandboxExecutionRequest.projectRoot` es opcional por compatibilidad; si se omite se interpreta como `.`. Cuando llega, es una ruta POSIX relativa, normalizada, existente bajo `repositoryRoot`, sin absoluta, traversal ni escape por symlink.
- `PHP_LARAVEL_PHPUNIT` instala y ejecuta Composer/PHPUnit con cwd en `repositoryRoot/projectRoot`. La materialización y validación de `ExecutionArtifactInput.relativePath` mantienen rutas canónicas relativas al repositorio; el cambio de cwd no elimina el prefijo del subproyecto.
- `NODE_TYPESCRIPT` conserva `projectRoot = .` y sus reglas actuales. Sandbox no detecta ni elige la raíz: Core envía el `effectiveProjectRoot` congelado.

## Frontera ciega

Sandbox no recibe GitHub installation/repository/PR, identidad humana, prompts, chunks, Functional Knowledge, variante experimental ni política de publicación. Recibe snapshot, tests/materialización, targets técnicos y referencias de evidencia.

## Fuera de alcance T-001

La implementación Docker/PHP, imágenes y adapter PHPUnit pertenecen al perfil PHP de HU11 (antes HU43) posterior. El proveedor remoto permanece bloqueado solo por `DEC-INF-001`.

## Corte T-003 — Validación PHP/Laravel utilizable como evidencia (HU11, perfil PHP)

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
6. **Reporte ausente o vacío.** PHPUnit 11 deja el JUnit vacío (0 bytes) cuando no puede cargar un archivo de test y escribe el motivo en stdout (verificado). Un reporte ausente o vacío nunca es `COMPLETED`: si la salida del profile PHP contiene un error de sintaxis de PHP (`syntax error, unexpected`, `Parse error`, `ParseError`, `Unclosed '{'`) la falla es `TEST_COMPILATION_FAILED` / `COMPILATION`; en otro caso, `TEST_EXECUTION_FAILED` / `TEST_RUNTIME`.
7. **Reporte limpio.** Antes de ejecutar el runner se elimina cualquier archivo de resultados preexistente en el workspace, para no leer un reporte que no produjo esta ejecución.
8. **Límites.** El límite de memoria por defecto del container pasa de 256 MiB a 1 GiB (Composer/pnpm de proyectos reales); sigue siendo configuración del Sandbox.

### Fuera de este corte

Persistencia del repositorio de ejecuciones, límite de concurrencia, reconciliación de containers huérfanos, mapeo de UID y filtrado de red para la VM remota (infraestructura remota de HU11 / `DEC-INF-001`), y nombrar tests relevantes del baseline (requiere cambio de contrato en Core). El usuario aprobó después el corte local y acotado `WI-SANDBOX-002`: no-root dentro del container PHP y ownership del volumen local; no cambia esa exclusión de infraestructura remota.

## WI-SANDBOX-001 — Ejecutar PHP bajo el `projectRoot` enviado por Core (HU11, perfil PHP)

**Estado:** implementado y verificado localmente.

## WI-SANDBOX-002 — Identidad local PHP no-root (HU11, perfil PHP)

**Estado:** aprobado por el usuario (2026-10-12) para Docker local.

La imagen PHP gestionada crea `sandbox` (UID/GID 10001), identidad obligatoria de `PHP_LARAVEL_PHPUNIT`. Antes de la primera instalación, un bootstrap efímero, sin red y memoizado inicializa recursivamente exclusivamente el named volume de cache Composer con ese ownership; la instalación y los tests nunca ejecutan como root. El bootstrap conserva `CapDrop: ['ALL']`, añade únicamente `CHOWN` y no monta el workspace. `pnpm-workspace.yaml` declara explícitamente la raíz. No se selecciona proveedor, VM, GCE, despliegue ni se modifica contrato alguno.

El WI conserva SDD 2.1 y la decisión de un único Project por repositorio. Core detecta un único candidato `composer.json` y envía la raíz congelada; Sandbox solo valida y aplica el campo. No hay selección en Console ni política local para múltiples candidatos.

## WI-SANDBOX-005 — Acceso ACL al workspace para PHP no-root (habilitador técnico, trazado a HU11)

**Estado:** aprobado por el usuario (2026-10-12) para registrar y corregir el corte técnico. El usuario decidió trazar el corte a `HU11` (`storyIds: ["HU11"]`, commit con `Refs: HU11`); no se crea una historia nueva ni se cambia la política de trazabilidad.

La raíz privada de cada workspace debe seguir aislada de otros usuarios y ejecuciones, pero permitir al runner PHP no-root UID/GID 10001 leer y escribir únicamente el workspace de su ejecución. El proceso host que administra el workspace debe conservar acceso para medirlo, leer evidencia y limpiarlo. Se concederán permisos POSIX ACL acotados; queda prohibido abrir permisos globales (`0777`) o ejecutar el profile PHP como root.

La configuración ACL se aplica por workspace antes de materializar el snapshot/artefactos y se hereda a los archivos y directorios creados con Composer y durante las pruebas. La implementación debe fallar explícitamente y de forma segura si no puede establecer o verificar los permisos requeridos. Debe probar aislamiento entre workspaces, lectura/escritura del runner, acceso/limpieza del proceso host y el caso adversarial en que código no confiable cambie permisos de archivos/directorios que posee; no se promete impedir que un contenedor cause denegación de servicio sobre sus propios archivos.

La utilidad `setfacl` del host (paquete Linux `acl`) es un prerrequisito de operación para el despliegue actual; este WI no la instala en la VM ni realiza otros cambios externos. No se modifican `SDD 2.1`, `SYSTEM-2.2`, `INTEROP-2.8`, autenticación, límites, ni la identidad PHP 10001.

**Plataformas y clasificación de fallos (corrección 2026-10-12):** la ACL se aplica y verifica solo cuando el host es Linux, donde sigue siendo obligatoria y falla cerrada. En hosts sin soporte ACL (macOS/Windows con Docker Desktop, donde el montaje bind mapea la propiedad) se omite y se registra en log; esos hosts son solo de desarrollo local. Si en Linux faltan `setfacl`/`getfacl` o no se pueden verificar las entradas, la ejecución falla con `category: INFRASTRUCTURE` y `code: WORKSPACE_PROVISIONING_FAILED` (campo `code` libre de `SandboxFailureFact`; sin cambio de contrato). `acl` es prerrequisito de **todos** los perfiles en hosts Linux, no solo PHP. La recuperación de ACL en contenedor repara únicamente entradas del UID 10001 (único con propiedad para `setfacl`); el host limpia primero con `rm` y solo si falla restaura entradas propias. La imagen gestionada `tjc-sandbox-php:8.3-nonroot` debe reconstruirse al desplegar este corte (se construye solo si no existe).
