# Imagen gestionada del profile PHP_LARAVEL_PHPUNIT (009; ampliada en WI-SANDBOX-021).
# ContainerRunner la construye vía Docker API la primera vez que falta en el
# host. Contiene solo runtime: nunca código del proyecto ni credenciales.
#
# - Base php:8.3-cli: ya incluye ctype, dom, fileinfo, mbstring, openssl,
#   tokenizer, xml, pdo, pdo_sqlite, sqlite3, curl, iconv, json, sodium, zlib...
# - Extensiones añadidas en 021 (docker-php-ext-*): intl, gd (con jpeg, freetype
#   y webp), zip, bcmath y gmp. Las exigen proyectos PHP/Laravel habituales y
#   sus dependencias (p. ej. phpspreadsheet exige gd y zip).
#   Los paquetes -dev de compilación se purgan al final; quedan solo las
#   librerías de runtime que enlazan las extensiones.
# - acl (restore-workspace-acl) y unzip (Composer) por apt.
# - memory_limit = 512M (zz-sandbox.ini, WI-SANDBOX-021): el default de 128M de
#   php-cli corta suites grandes como doctrine/orm con "Allowed memory size".
#   No es OOM del contenedor: el Sandbox ya acota el contenedor a 1 GiB.
# - Composer 2 en el PATH, copiado de la imagen oficial.
# - Usuario no-root `sandbox` con UID/GID 10001 (identidad fija, no configurable).
ARG PHP_IMAGE=php:8.3-cli
ARG COMPOSER_IMAGE=composer:2

FROM ${COMPOSER_IMAGE} AS composer

FROM ${PHP_IMAGE}
RUN set -eux; \
    savedAptMark="$(apt-mark showmanual)"; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        acl unzip \
        libicu-dev libzip-dev libgmp-dev \
        libpng-dev libjpeg-dev libfreetype-dev libwebp-dev; \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp; \
    docker-php-ext-install -j"$(nproc)" intl gd zip bcmath gmp; \
    extDir="$(php -r 'echo ini_get("extension_dir");')"; \
    apt-mark auto '.*' > /dev/null; \
    apt-mark manual $savedAptMark acl unzip > /dev/null; \
    find "$extDir" -name '*.so' -type f -exec ldd {} + \
      | awk '/=>/ { so = $(NF-1); if (index(so, "/usr/local/") == 1) { next }; gsub("^/(usr/)?", "", so); print so }' \
      | sort -u \
      | xargs -r dpkg-query --search \
      | cut -d: -f1 \
      | sort -u \
      | xargs -r apt-mark manual > /dev/null; \
    apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
        libicu-dev libzip-dev libgmp-dev \
        libpng-dev libjpeg-dev libfreetype-dev libwebp-dev; \
    rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY restore-workspace-acl /usr/local/bin/restore-workspace-acl
COPY zz-sandbox.ini /usr/local/etc/php/conf.d/zz-sandbox.ini
RUN chmod 0755 /usr/local/bin/restore-workspace-acl
RUN groupadd --gid 10001 sandbox \
 && useradd --uid 10001 --gid sandbox --create-home --shell /usr/sbin/nologin sandbox
