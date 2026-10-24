Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-021 · Análisis SDD

**Veredicto: SPEC_VERIFIED** (con hallazgos de documentación a actualizar dentro del propio WI; ningún gap de decisión).

## 1. Texto que afirma las extensiones actuales (debe actualizarse)
- `app/docker/php/Dockerfile:5-9` (comentario: «php:8.3-cli ya incluye…», «no trae ni unzip ni ext-zip») y `:17-18` (apt `acl unzip`).
- `spec/features/009-execution-profiles/spec.md:36` («las extensiones exigidas por su lock están todas incluidas en `php:8.3-cli`») y `:40` regla 1 («`php:8.3-cli` + `unzip` + Composer 2»; ahí añadir qué es configuración de imagen y qué redesplegar).
- `spec/features/009-execution-profiles/plan.md:15` (imagen gestionada) — añadir referencia a la ampliación.
- `spec/features/009-execution-profiles/tasks.md:45` (ST-SANDBOX-021, T-READY → cierre) y nota `:16`.
- `app/README.md:16` (dice además tag `tjc-sandbox-php:8.3`, incorrecto: el real es `tjc-sandbox-php:8.3-nonroot`; corregir).
- `app/.env.example:81-85` (mencionar extensiones y que la imagen gestionada no se reconstruye sola).
- `app/src/container/container-limits.config.ts:27-30,61` (comentarios; `MANAGED_PHP_IMAGE` en `:30`).
- `app/src/container/container-runner.service.ts:201` (comentario «Composer y unzip ya incluidos»; opcional).
- Runbooks históricos `harness/reports/wi-sandbox-005-vm-deploy-runbook.md:11` y `wi-sandbox-008-vm-deploy-runbook.md:6-9,14` son historia: no editar; el procedimiento de despliegue de 021 va en un runbook nuevo `wi-sandbox-021-vm-deploy-runbook.md` (mismo patrón: tag `-prev`, `docker build -q -t …`, verificación `php -m`, reversión).
- `spec/features/004-container-execution/*` no menciona extensiones: sin cambio. `README.md` raíz: sin cambio.
- Fuera de este repo (no tocar): `../tjc-be-rag-core-api/harness/reports/pilotos-runbook-operativo.md:60-61` afirma «sin intl/gd/zip/bcmath/gmp»; avisar a cross para que Core lo actualice tras 021.

## 2. Construcción y versionado
- `container-runner.service.ts:529-575`: `ensureImage` → `provisionImage` hace `docker.getImage(image).inspect()`; si existe, retorna. Solo construye (`buildImage`, contexto `MANAGED_PHP_IMAGE_CONTEXT`, `src: ['Dockerfile','restore-workspace-acl']`, `t: image`) si falta, y solo para el tag `MANAGED_PHP_IMAGE = 'tjc-sandbox-php:8.3-nonroot'` (`container-limits.config.ts:30`). Cualquier otro valor de `SANDBOX_DEFAULT_PHP_IMAGE` se hace `pull`.
- **No se reconstruye si cambia el Dockerfile.** En la VM la imagen ya existe (runbooks 005/008) y no se reconstruirá sola. Despliegue: `docker build` manual con el mismo tag (y respaldo `-prev`, como 008), o tag nuevo + `SANDBOX_DEFAULT_PHP_IMAGE` (entonces se haría `pull` → fallaría `IMAGE_UNAVAILABLE` si no está en un registro: un tag nuevo local exige `docker build` previo; el build automático solo aplica al tag gestionado). Recomendación: mismo tag + build manual (reversión inmediata con `-prev`). El despliegue lo ordena el usuario aparte.
- Primera construcción desde cero con apt de headers: requiere red y varios minutos (compilación de gd/intl/gmp con `docker-php-ext-install`).

## 3. Seguridad / neutralidad
- Imagen solo runtime: Dockerfile sin COPY de código ni secretos (`Dockerfile:13-20`); usuario `sandbox` 10001 (`:21-22`). Sigue sin red en tests (spec 009 regla 3) y `CapDrop: ['ALL']` (spec.md:40).
- Añadir intl/gd/zip/bcmath/gmp suma librerías nativas (libicu, libpng/libjpeg/freetype, libzip, libgmp) = más superficie de CVE en parsers de imágenes/zip, pero el código no confiable ya corre arbitrario PHP en el contenedor; el aislamiento (no root, sin red, CapDrop, límites) no depende de las extensiones. Impacto: bajo; mitigar con `--no-install-recommends`, borrar listas apt y dev headers solo si se puede (libs runtime deben quedar), y rebuild periódico fuera de experimento.
- Tesis: ADR-06 (`referencias/tesis.md:1138,1177,2243`) = Sandbox técnico y neutral (sin tokens, FK, prompts); ADR-10 (`:1181,2247`) = VM Linux + Docker, «reproducible y portable». Nada contradice ampliar la imagen: no entra semántica de producto. Aviso de coherencia: la imagen debe congelarse antes de la evidencia (OE4/OE5); documentar versión/digest de la imagen en la evidencia. El término «Sandbox neutral» de la spec se refiere a ADR-06; el AC cita ADR-10: citar ambos.

## 4. ICU
- `php:8.3-cli` (Debian; bookworm al momento del análisis, **no verificado aquí**, sin build) trae/enlaza libicu de Debian (ICU 72 en bookworm; con `docker-php-ext-install intl` se enlaza contra libicu-dev de esa base). money fija `ubuntu-24.04` (ICU 74) porque sus tests `intl` afirman datos CLDR (`pilotos-runbook…:~79`). Una imagen Debian con ICU 72 puede producir fallos CLDR en money no atribuibles al código del PR.
- Alternativa: base `ubuntu:24.04` + `php8.3-cli php8.3-intl php8.3-gd php8.3-zip php8.3-bcmath php8.3-gmp php8.3-xml php8.3-mbstring php8.3-sqlite3 php8.3-curl` (ICU 74; ojo: Ubuntu 24.04 trae PHP 8.3 en apt, sin PPA). Implica reescribir el Dockerfile (Composer vía COPY sigue valiendo, usuario 10001 pudiendo chocar con el usuario `ubuntu` UID 1000: ok) y cambia la base respecto a las specs. Decisión para el usuario/leader; no es DEC bloqueante. El smoke debe imprimir `INTL_ICU_VERSION` y fallar/avisar si money falla por CLDR; en ese caso se decide cambiar de base. Recomendación: probar primero la ruta `docker-php-ext-install` sobre php:8.3-cli y solo cambiar de base si el smoke de money lo exige.

## 5. Pruebas
- Existe: `app/src/container/restore-workspace-acl.spec.ts` (conductual; construye `TEST_IMAGE` desde `docker/php` `:14`, se salta con `skipIf` sin Docker; debe pasar con la imagen nueva y es parte de la verificación). Los tests de `container-runner.service.spec.ts` solo usan fakes (`MANAGED_PHP_IMAGE`, `:578`).
- Faltan: (a) test estático `app/src/container/php-image-dockerfile.spec.ts` que lea `app/docker/php/Dockerfile` y exija intl, gd, zip, bcmath, gmp, acl, unzip, Composer, `useradd --uid 10001`, `groupadd --gid 10001`, y que NO contenga `COPY` de código/`.env`/credenciales (solo `restore-workspace-acl` y composer); (b) smoke manual documentado (no automatizado en CI): `php -m` con ctype, dom, fileinfo, filter, hash, iconv, json, libxml, mbstring, openssl, pcre, session, tokenizer, pdo_sqlite + nuevas; `php -r 'echo INTL_ICU_VERSION;'`; `composer --version`; id del usuario; luego en clones scratch de money/orm/Vouchers (develop) `composer install --no-scripts` + phpunit; evidencia en `harness/reports/wi-sandbox-021-smoke-evidence.md`. Vouchers requiere Postgres/MySQL (ver runbook Core §1.2): su fallo por BD es esperado y no es de la imagen; registrar y decidir `pdo_pgsql`/`pdo_mysql` solo si el smoke lo muestra («las que detecte el smoke»).

## 6. Decisiones
Ninguna `DEC` con `Blocks` alcanzando WI-SANDBOX-021: `contractImpact:false`, `dependsOn:[]` en `harness/work-items.json:397-418`; búsqueda en spec/harness sin PENDING/PROPOSED que bloquee. Añadir `ST-SANDBOX-021` ya existe en `tasks.md:45`. Lane: puede ser FAST (sin contrato ni comportamiento observable salvo la imagen).

## Archivos a cambiar
1. `app/docker/php/Dockerfile` (extensiones + comentario)
2. `app/src/container/php-image-dockerfile.spec.ts` (nuevo)
3. `spec/features/009-execution-profiles/spec.md` (:36, :40 + config de imagen/ADR-06/ADR-10 + redeploy)
4. `spec/features/009-execution-profiles/plan.md` (:15)
5. `spec/features/009-execution-profiles/tasks.md` (:45 cierre, nota)
6. `app/README.md` (:16, tag correcto), `app/.env.example` (:81-85)
7. `app/src/container/container-limits.config.ts` (comentarios :27-30,:61) y opcional `container-runner.service.ts:201`
8. `harness/reports/wi-sandbox-021-vm-deploy-runbook.md` y `…-smoke-evidence.md` (nuevos); `harness/work-items.json`, `harness/state.json`, `CHANGELOG.md` según flujo.
No editar: runbooks 005/008 (historia), `../tjc-be-rag-core-api`.

## Cierre del leader
Alcance aprobado por el usuario en el chat del Sandbox (2026-10-24). Se cita además ADR-06 (Sandbox neutral) junto a ADR-10. La imagen se congela tras este WI: se registra su digest en el reporte de smoke. Veredicto: **SPEC_VERIFIED** (sin DEC bloqueante).
