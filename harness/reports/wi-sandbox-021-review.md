Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# WI-SANDBOX-021 · Revisión independiente

**Veredicto: APPROVED** (0 BLOCKER, 0 MAJOR, 4 MINOR). Commit revisado: `a4231d7`. Sin DEC bloqueante, sin cambio de contrato.

## Evidencia por punto

1. **Dockerfile / ini.** Imagen reconstruida por mí (`docker build --no-cache -t tjc-sandbox-php:review app/docker/php`, 51 s, sin warnings). Con `--user 10001:10001 --cap-drop ALL --network none`:
   - `php -m` incluye bcmath, gd, gmp, intl, zip, ctype, dom, fileinfo, filter, hash, iconv, json, libxml, mbstring, openssl, pcre, session, tokenizer, pdo_sqlite. No hay pdo_pgsql ni pdo_mysql.
   - `INTL_ICU_VERSION` 76.1, PHP 8.3.36, `memory_limit` 512M (como uid 10001).
   - Funcional: `NumberFormatter` de_DE devuelve `1.234,50 €`; `imagecreate`/`imagepng` OK, `imagewebp`/`imagejpeg`/`imagettftext` existen; `gmp_add` y `bcadd` correctos; `ZipArchive` escribe un zip.
   - `id sandbox` = 10001:10001; `setfacl`, `getfacl`, `unzip`, `restore-workspace-acl` y `composer` (2.10.3) presentes.
   - `ldd` de intl/gd/zip/gmp/bcmath `.so`: 0 «not found». Libs de runtime presentes (libicu76, libzip5, libgmp10, libpng16, libjpeg62-turbo, libfreetype6, libwebp7). Ningún paquete `*-dev` de los purgados queda instalado.
   - `docker history`: solo COPY de `zz-sandbox.ini`, `restore-workspace-acl`, composer y los de la base. No hay código ni `.env` ni claves (los únicos `.pem` son los CA del sistema).
2. **Contexto de build gestionado.** `container-runner.service.ts:558`: `src` pasa a `['Dockerfile','restore-workspace-acl','zz-sandbox.ini']`; es el único sitio de producción que lista el contexto (grep). `restore-workspace-acl.spec.ts` construye el directorio entero con el CLI y no lista archivos. No hay `.dockerignore`. Simulé el tar con esos 3 archivos (`tar -cf - Dockerfile restore-workspace-acl zz-sandbox.ini | docker build -`): construye y da `512M` con gmp. Sin `zz-sandbox.ini` en el tar el build falla con «"/zz-sandbox.ini": not found», así que el cambio es necesario y suficiente. Sin otro efecto en lógica.
3. **Test estático `php-image-dockerfile.spec.ts`.** Mutaciones en el árbol con restauración (git status limpio al final): quitar `gmp` falla; quitar el `COPY` del ini falla; `memory_limit` 128M falla; añadir `COPY src /app` falla; quitar `--with-webp` falla; quitar `unzip` falla; GID 10002 falla. No es tautológico.
4. **Smoke.** Reproduje con mi imagen, comando tipo Sandbox (`--memory 1g --pids-limit 128 --network none`, `composer install --no-scripts` con red): money 1060 tests / 2079 assertions OK (ICU 76.1); orm 3686 tests / 12431 assertions OK con 3 deprecaciones, 78 omitidos y 2 incompletos, sin `-d memory_limit`. Coinciden con el reporte. Vouchers: `phpunit.sqlite.xml` solo cambia las 6 variables DB respecto del `phpunit.xml` original. Se hizo la copia de trabajo en el scratchpad; los clones no se tocaron.
5. **Forks.** `git status` en los clones: money y orm limpios; Vouchers solo `?? phpunit.sqlite.xml` (más `composer.lock` ignorado). `git log origin/develop..HEAD` vacío en los tres. Ramas `develop`, SHA `93f145c`, `b44f3dff4`, `546f871` como declara el reporte. sha256 de los 3 `composer.lock` y de `Vouchers-phpunit.sqlite.xml` coinciden con el reporte. No se leyó `app/.env`.
6. **Spec/plan/tasks/CHANGELOG/runbook.** La sección «Ampliación de la imagen PHP» es coherente con la implementación. Cita ADR-06 y ADR-10 con propiedad: ADR-06 es Sandbox técnico y neutral, y ADR-10 es VM Linux + Docker reproducible y portable (`referencias/tesis.md:1177,1181,2243,2247`). El runbook es seguro: respaldo `-prev`, reversión, sin IPs ni secretos, no ejecutado. No afirma nada no verificado, salvo los matices MINOR de abajo.
7. **Contrato.** `git show HEAD --stat -- spec/contracts` vacío.
8. **Gates.** `pnpm lint` 0; `pnpm test` 38 archivos, 326 passed y 3 skipped; `pnpm build` 0; `pnpm contracts:check` 0. En la raíz: `validate-work-items`, `validate-harness` y `validate-completions` pasan, `validate-completions.test` pasa, y `node --test harness/*.test.mjs` da 31/31 pass.

Limpieza: tag `review` y `review-tar` borrados; volúmenes `rev-cc-*` borrados; copias de trabajo en el scratchpad borradas. Quedan `tjc-sandbox-php:8.3-nonroot` (`e41aa91a…`, intacto) y `-prev` (`b5839ef3…`, intacto). `git status` limpio.

## Hallazgos

- **MINOR-1** `harness/reports/wi-sandbox-021-vm-deploy-runbook.md` paso 5: `command -v composer setfacl unzip` bajo `sh` (dash) solo comprueba el primer operando (verificado: imprime solo composer). Sustituir por un bucle `for c in …; do command -v $c || echo MISSING $c; done`.
- **MINOR-2** `harness/reports/wi-sandbox-021-smoke-evidence.md` (cabecera y §2): el `-prev` local (`b5839ef3…`) es una iteración intermedia de 021, con intl y gd pero sin `memory_limit` 512M. No es la imagen previa a 021. Aclararlo: en la VM, `-prev` sí será la imagen pre-021.
- **MINOR-3** Mismo reporte, cabecera, §1 y §6: «Sin commit ni push», «sin commit» y la nota de `git status` están obsoletas tras `a4231d7`.
- **MINOR-4** `Dockerfile`: `ARG PHP_IMAGE=php:8.3-cli` no está fijada por digest (la base ya es Debian trixie, ICU 76.1). Una reconstrucción posterior puede dar otra versión de PHP o ICU. Congelar la imagen implica registrar su digest, como ya hace el runbook (paso 6). Opcional: el test estático no cubre la purga de `-dev` ni el `ldd`. Eso se verificó aquí por comando, no por test.

Nota (sin acción en este WI): `spec.md:36` («extensiones … incluidas en php:8.3-cli») describe el repositorio de referencia histórico, no la imagen actual. Es correcta como está. `../tjc-be-rag-core-api/harness/reports/pilotos-runbook-operativo.md:61` sigue diciendo «No hay intl/gd/zip/bcmath/gmp»; es de Core y lo actualiza su dueño (ya señalado en el análisis SDD).

## Comandos principales
`docker build --no-cache -t tjc-sandbox-php:review app/docker/php`; `docker run --rm --user 10001:10001 --cap-drop ALL --network none --entrypoint php tjc-sandbox-php:review -m` y `-r …`; `ldd` sobre las `.so`; `tar -cf - Dockerfile restore-workspace-acl zz-sandbox.ini | docker build -`; mutaciones con `npx vitest run src/container/php-image-dockerfile.spec.ts`; `pnpm lint|test|build|contracts:check` en `app/`; `node harness/validate-*.mjs`; `node --test harness/*.test.mjs`; `git -C <clone> status` y `git log origin/develop..HEAD`; `shasum -a 256`.
