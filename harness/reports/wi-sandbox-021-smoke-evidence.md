Modelo: implementer-high · configurado claude-haiku-5-5 · atendido unknown · esfuerzo high

# WI-SANDBOX-021 · Evidencia de imagen PHP y smoke en forks

Fecha: 2026-10-24. Estado final: **imagen ampliada y verificada (digest definitivo abajo); money y orm pasan su suite completa con el comando del Sandbox; Vouchers no pasa (hallazgo de BD/migraciones, no de imagen)**. Sin commit ni push.

Digest definitivo: `sha256:e41aa91aca5d4eb00e8228c4ebbc16d516fcb7ba8fe94a9038bbbe203694fbc7` (`tjc-sandbox-php:8.3-nonroot`). Digest anterior, sustituido en esta revisión: `sha256:b5839ef360bca40367ad780698fc27d4dccac27d66e2029689d89701a08b21f4` (conservado como `tjc-sandbox-php:8.3-nonroot-prev` para reversión).

## 1. Cambios en el repo (sin commit)

| Archivo | Cambio |
|---|---|
| `app/docker/php/Dockerfile` | Añade `intl`, `gd` (jpeg, freetype, webp), `zip`, `bcmath`, `gmp` con `docker-php-ext-configure`/`docker-php-ext-install -j$(nproc)`. Purga los `-dev` al final conservando las libs de runtime (patrón oficial de la imagen php). Mantiene `acl`, `unzip`, Composer 2, `restore-workspace-acl`, usuario `sandbox` 10001/10001. Cabecera actualizada, incluida la razón de `memory_limit`. Nueva línea `COPY zz-sandbox.ini /usr/local/etc/php/conf.d/zz-sandbox.ini`. |
| `app/docker/php/zz-sandbox.ini` | Nuevo. Único ajuste de PHP: `memory_limit = 512M`, con comentario de la razón (default 128M de php-cli; no es OOM del contenedor, que ya está acotado a 1 GiB). Sin display_errors, opcache ni otros. |
| `app/src/container/container-runner.service.ts` | Dos cambios. (a) Comentario de `buildPhpInstallOptions` (~201): extensiones incluidas. (b) **Lista de contexto del build gestionado** (~558): `src: ['Dockerfile', 'restore-workspace-acl', 'zz-sandbox.ini']`. Sin esto, un host sin imagen no podría construirla, porque el Dockerfile copia el ini. |
| `app/src/container/container-runner.service.spec.ts` | Espera la nueva lista `src` (línea ~555). |
| `app/src/container/php-image-dockerfile.spec.ts` | Nuevo. Test estático (vitest, sin Docker): intl, gd (jpeg/freetype/webp), zip, bcmath, gmp; acl, unzip; Composer; UID/GID 10001; `zz-sandbox.ini` con `memory_limit = 512M` y su `COPY` al conf.d; ningún `ADD` ni `COPY` fuera de `restore-workspace-acl`, Composer y el ini; sin referencias a `.env`, `src/`, `vendor/` ni claves. |
| `app/src/container/container-limits.config.ts` | Solo comentarios: extensiones, `memory_limit` y que cambiar el Dockerfile no reconstruye la imagen existente. Sin cambio de valores. |
| `app/README.md` | Tag corregido a `tjc-sandbox-php:8.3-nonroot`; extensiones; reconstrucción manual. |
| `app/.env.example` | Comentario de `SANDBOX_DEFAULT_PHP_IMAGE`. Sin cambio de valores. |

Reproducir: `git diff -- app/` y `git status --short` desde `tjc-be-test-execution-sandbox/`. Nada en `spec/`, `harness/` (salvo este reporte), `app/.env` ni `../tjc-be-rag-core-api` se tocó. En `git status` aparecen también `harness/state.json`, `harness/work-items.json`, `spec/features/009-execution-profiles/tasks.md` y `harness/reports/wi-sandbox-021-sdd-analysis.md`: ya estaban modificados o sin seguimiento antes de empezar este WI.

Diff del ini (archivo nuevo):

```ini
; WI-SANDBOX-021: límite de memoria de PHP de la imagen gestionada.
; php:8.3-cli sin php.ini usa 128M por defecto, y suites grandes como
; doctrine/orm (3686 tests) se cortan con "Allowed memory size of 134217728
; bytes exhausted". No es OOM del contenedor: el contenedor ya está acotado a
; 1 GiB por el Sandbox (SANDBOX_CONTAINER_MEMORY_BYTES).
; Único ajuste de PHP en esta imagen; el archivo se llama zz- para cargarse el último.
memory_limit = 512M
```

Desviación respecto al análisis SDD: la base real es **Debian 13 (trixie)**, no bookworm (`/etc/os-release` de `php:8.3-cli`). Por eso ICU es **76.1**.

## 2. Imagen (digest definitivo)

- Build: `docker build -t tjc-sandbox-php:8.3-nonroot app/docker/php` (exit 0). Antes: `docker tag tjc-sandbox-php:8.3-nonroot tjc-sandbox-php:8.3-nonroot-prev`.
- Digest `docker image inspect --format '{{.Id}}'`: `sha256:e41aa91aca5d4eb00e8228c4ebbc16d516fcb7ba8fe94a9038bbbe203694fbc7`.
- Versiones: PHP 8.3.36 (cli, NTS), Composer 2.10.3, `INTL_ICU_VERSION` = `76.1`. GD con FreeType, JPEG, PNG y WebP.
- `memory_limit`:
  - `docker run --rm --user 10001:10001 <img> php -i | grep memory_limit` → `memory_limit => 512M => 512M`.
  - `php -r 'echo ini_get("memory_limit");'` (root) → `512M`. Cargado: `/usr/local/etc/php/conf.d/zz-sandbox.ini`.
- `php -m | sort` (módulos): `bcmath, ctype, curl, date, dom, fileinfo, filter, gd, gmp, hash, iconv, intl, json, libxml, mbstring, mysqlnd, openssl, pcre, pdo_sqlite, posix, random, readline, session, sodium, sqlite3, standard, tokenizer, xml, xmlreader, xmlwriter, zip, zlib` (más Core, PDO, Phar, Reflection, SPL, SimpleXML, Zend OPcache).
  - Nuevas: `bcmath`, `gd`, `gmp`, `intl`, `zip`. Ya cubiertas (Laravel 12/PHP 8.2): `ctype`, `dom`, `fileinfo`, `filter`, `hash`, `iconv`, `json`, `libxml`, `mbstring`, `openssl`, `pcre`, `session`, `tokenizer`, `pdo_sqlite`. Todas presentes.
  - Ausentes a propósito: `pdo_pgsql`, `pdo_mysql` (`mysqlnd` sí viene en la base).
- Usuario: `id sandbox` → `uid=10001(sandbox) gid=10001(sandbox)`. `--user 10001:10001 --cap-drop ALL`: `whoami` = `sandbox`; escribir en `/usr/local/bin` → Permission denied.
- Librerías: `ldd` de las `.so` de extensiones sin `not found`. Quedan libs de runtime (`libicu76`, `libzip5`, `libgmp10`, `libpng16-16t64`, `libjpeg62-turbo`, `libfreetype6`, `libwebp7`) más `acl` y `unzip`. Los `-dev` restantes ya venían en la base `php:8.3-cli`.
- Tests de la app que tocan la imagen: `restore-workspace-acl.spec.ts` (conductual, Docker real, no saltado) y `php-image-dockerfile.spec.ts` pasan: 3 archivos, 29 tests con `container-runner.service.spec.ts`.

## 3. Forks (clones scratch, sin commit)

Ruta: `/Users/cjcarlosgc/Development/Tesis/_scratch-pilotos/` (fuera de repos del sistema). Clones de `develop` en los SHA base del runbook: money `93f145c`, orm `b44f3dff4`, Vouchers `546f871`.

Comando común (imita al Sandbox): `docker run --network <none|bridge> --memory 1g --memory-swap 1g --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --user 10001:10001`, `APP_ENV=testing`, `APP_KEY` aleatorio, `COMPOSER_HOME=/tmp/c`, caché Composer en volumen por fork, `timeout` interno. Memoria: `docker stats --no-stream` cada ~1 s (aproximación). `OOMKilled` por `docker inspect`.

Lock: `composer update --no-interaction --no-progress --prefer-dist --no-scripts` (red bridge, `timeout 180`). Equivale a `install` sin lock: resuelve y escribe el lock. Tests: `php vendor/bin/phpunit --log-junit /tmp/junit.xml` (`--network none`, `timeout 120`). Vouchers: `--configuration phpunit.sqlite.xml`.

### 3.1 money (`brick/money`)

- Lock `_scratch-pilotos/money/composer.lock`, sha256 `6345c29b729b0972077828e1d1065a8e0eb1c7812bac15a4b6e3553a258ef0fc`. 2 paquetes + 29 dev. Platform `php ^8.2`.
- Lock en frío: exit 0, 11 s, pico ~63 MiB, OOM no.
- Tests sin red, **tras el cambio de imagen**: exit 0, 2 s, **1060 tests, 2079 assertions, OK**. Pico ~0 MiB (muestreo; el proceso es corto), OOM no. Bootstrap: `ICU version: 76.1`.
- Sin fallos CLDR/ICU: la contingencia no se activa (el fork fija ICU 74 en su CI; con 76.1 pasa entera).
- Fase `install` previa (vendor ya existente): nada que instalar; no es medida de instalación.

### 3.2 orm (`doctrine/orm`)

- Lock `_scratch-pilotos/orm/composer.lock`, sha256 `74969a1d5d180fa3318583308dca93f4d4aed731618876c80e6d09f641be0eb8`. 22 paquetes + 46 dev. Platform `php ^8.1`, `ext-ctype`.
- Lock en frío: exit 0, 19 s, pico ~79 MiB.
- **Suite completa con el comando del Sandbox, imagen con `memory_limit=512M`** (sin `-d`), `--network none`, `timeout 120`: **exit 0, 16 s, pico ~175 MiB, OOMKilled = false**. **3686 tests, 12431 assertions, OK con avisos**: 3 deprecaciones, 78 omitidos, 2 incompletos. Log `_scratch-pilotos/logs/orm-tests512.log`.
- Antes del cambio (imagen con 128M), la misma suite: exit 255 al ~52 % con `Allowed memory size of 134217728 bytes exhausted` en `Util/Cloner.php`. OOMKilled = false. Causa: `memory_limit` de PHP, no el contenedor. Resuelto por `zz-sandbox.ini`.
- Subset `tests/Tests/ORM/Hydration` (corrida previa, imagen 128M): exit 0, 119 tests, 905 assertions, OK con 1 deprecación.

### 3.3 Vouchers (`EscolaLMS/Vouchers`) · hallazgo, no de imagen

- `phpunit.xml` original (pgsql `postgres`) **no tocado**. Variante SQLite: `_scratch-pilotos/Vouchers-phpunit.sqlite.xml` (sha256 `bf696c9a76ebde134675bcbf159840170286a66d6174153b475e43d60df867ba`). Copia en el clon como `phpunit.sqlite.xml` (untracked). El fork no trae `phpunit.xml.sqlite.dist`.
- Lock `_scratch-pilotos/Vouchers/composer.lock`, sha256 `72c6850bea5ca0dbb6499cc9d1de9e8b28d50972ed9927bbf6fa3ac5d38cf96b`. 139 + 48 paquetes. Platform `php >=7.4`. Requiere `ext-gd` y `ext-zip` (phpspreadsheet/maatwebsite), presentes en la imagen. `laravel/framework` resuelve a `10.x-dev` (rama de desarrollo; reproducibilidad).
- Lock en frío: exit 0, 40 s, pico ~287 MiB.
- Tests sin red con SQLite: **exit 2, 37 errores** `SQLSTATE[HY000]: General error: 1 no such table: roles`. Causa: el CI del fork ejecuta `vendor/bin/testbench migrate:fresh` antes de PHPUnit (`.github/workflows/test.yml`); el Sandbox no migra.
- Diagnóstico en el clon (`testbench.yaml` restaurado byte a byte):
  - Con el `testbench.yaml` original, `migrate:fresh` falla con `could not find driver`: el fork fuerza `DB_CONNECTION=pgsql` y `pdo_pgsql` no está en la imagen.
  - Con `testbench.yaml` forzado a SQLite en fichero, la migración falla: `SQLite doesn't support multiple calls to dropColumn / renameColumn in a single modification`. **SQLite no sirve para las migraciones del fork.**
- Conclusión: Vouchers requiere un servidor de BD y migraciones, que el Sandbox no tiene (spec 019:29, solo SQLite; `--network none`). No es tema de imagen. Decisión del leader (no se añadieron `pdo_pgsql` ni `pdo_mysql`).

## 4. Extensiones adicionales

No se añadió `pdo_pgsql` ni `pdo_mysql`, por decisión del leader. El fallo `could not find driver` aparece solo con `testbench migrate:fresh` y la config pgsql del fork, y añadir el driver no bastaría (no hay servidor, `--network none`, SQLite no migra).

## 5. Lo que NO se pudo comprobar

1. Vouchers end-to-end: sin BD ni migraciones en el Sandbox. Los 37 errores son reales pero no miden el código del PR.
2. Tiempos y memoria con muestreo de 1 s: picos muy cortos pueden no verse. La ausencia de OOM se basa en `OOMKilled=false`.
3. Límite total de 10 min del Sandbox: no aplicado en el script (solo `timeout` por fase). Tiempos sumados (lock + tests) con la imagen final: money ~13 s, orm ~35 s, Vouchers ~43 s.
4. money en PHP 8.2 y demás versiones de la matriz de su CI: no ejecutado. Solo PHP 8.3.36.
5. ICU: solo se comprobó ICU 76.1 con la suite de money. No se comprobó paridad con ICU 74 (CI del fork).
6. Despliegue en la VM del Sandbox: no hecho. Requiere `docker build` manual con el mismo tag (y `-prev` para reversión); lo ordena el usuario.
7. Pipeline real Core → Sandbox con estos repos: no ejecutado. El smoke imita el contenedor.

## 6. Verificación en app/ (repo Sandbox, sin commit)

Con la imagen final y tras los cambios de `zz-sandbox.ini` y `container-runner`:

| Comando | Resultado |
|---|---|
| `pnpm lint` (`oxlint src/ test/`) | exit 0 |
| `pnpm test` (`vitest run`) | exit 0. **38 archivos passed; 326 tests passed, 3 skipped (329)** |
| `pnpm build` (`nest build`) | exit 0 |
| `pnpm contracts:check` | exit 0 |

## 7. Limpieza y estado

- Docker Desktop estaba parado al empezar; se arrancó con `open -a Docker`.
- Borrados: `vendor/`, `.phpunit.cache` y `.phpunit.result.cache` de los tres clones (con contenedor root, dentro de Docker). Borrados los volúmenes `smoke-composer-cache-money|orm|Vouchers`.
- Conservados en `_scratch-pilotos/`: `money/composer.lock`, `orm/composer.lock`, `Vouchers/composer.lock`, `Vouchers-phpunit.sqlite.xml`, y `logs/` (`summary.txt`, `sha256.txt`, `*-composer-show.txt`, logs y junit de cada fase).
- Imágenes locales: `tjc-sandbox-php:8.3-nonroot` (digest final) y `tjc-sandbox-php:8.3-nonroot-prev` (digest previo, para reversión). El test `restore-workspace-acl` borra su propia imagen de prueba al terminar.
- Los clones no tienen cambios versionados. Los locks están ignorados por `.gitignore`.

## 8. Recomendación para el leader

1. Aceptar la imagen con digest `sha256:e41aa91a…` como base de 021 y congelarla tras la revisión independiente.
2. orm: con `memory_limit` 512M, la suite completa pasa con el comando del Sandbox (16 s, sin OOM). Pico ~175 MiB frente a 1 GiB.
3. Vouchers: no apto para el piloto en el Sandbox tal como está (requiere BD y migraciones). Decisión de piloto o de fork, no de imagen.
4. money: sin bloqueo de ICU con 76.1.
5. Core (`pilotos-runbook-operativo.md`, líneas ~60-61 y §1.2) afirma «sin intl/gd/zip/bcmath/gmp» y no menciona `memory_limit`. Lo debe actualizar el dueño de Core. No se tocó.


## Notas del leader tras la revisión
- El tag local `tjc-sandbox-php:8.3-nonroot-prev` (b5839ef3…) es una iteración intermedia de este WI (intl y gd con `memory_limit` 128M), **no** la imagen anterior a 021; en la VM sí será la imagen previa.
- Las menciones «sin commit ni push» de este reporte describen el momento de la entrega del implementer; el WI se commiteó después (a4231d7).
- La base `php:8.3-cli` no está fijada por digest (hoy Debian trixie, ICU 76.1): una reconstrucción puede variar; el digest de la imagen construida se registra en el runbook (idea diferida I-SANDBOX-015).
