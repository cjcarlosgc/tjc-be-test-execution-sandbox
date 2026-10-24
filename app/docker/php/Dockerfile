# Imagen gestionada del profile PHP_LARAVEL_PHPUNIT (009, corte T-003).
# ContainerRunner la construye vía Docker API la primera vez que falta en el
# host. Contiene solo runtime: nunca código del proyecto ni credenciales.
#
# - php:8.3-cli ya incluye las extensiones que exige un Laravel 12 típico
#   (ctype, dom, fileinfo, mbstring, openssl, tokenizer, xml, pdo_sqlite...).
# - unzip: Composer lo necesita para extraer paquetes (la imagen base no
#   trae ni unzip ni ext-zip).
# - ext-intl (WI-SANDBOX-020): la imagen base no la trae y Laravel la usa vía
#   Locale/NumberFormatter (p. ej. middleware de idioma, Number::currency).
#   Se compila con libicu-dev y se purgan los paquetes de compilación,
#   conservando solo la librería ICU de runtime (patrón de la imagen oficial).
# - Composer 2 en el PATH, copiado de la imagen oficial.
ARG PHP_IMAGE=php:8.3-cli
ARG COMPOSER_IMAGE=composer:2

FROM ${COMPOSER_IMAGE} AS composer

FROM ${PHP_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends acl unzip \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    savedAptMark="$(apt-mark showmanual)"; \
    apt-get update; \
    apt-get install -y --no-install-recommends libicu-dev; \
    docker-php-ext-install -j"$(nproc)" intl; \
    apt-mark auto '.*' > /dev/null; \
    apt-mark manual $savedAptMark > /dev/null; \
    find /usr/local -type f -executable -exec ldd '{}' ';' 2>/dev/null \
      | awk '/=>/ { so = $(NF-1); if (index(so, "/usr/local/") == 1) { next }; gsub("^/(usr/)?", "", so); printf "*%s\n", so }' \
      | sort -u | xargs -r dpkg-query --search | awk -F: '!/^diversion/ { print $1 }' | sort -u \
      | xargs -r apt-mark manual > /dev/null; \
    apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false; \
    rm -rf /var/lib/apt/lists/*; \
    php -r 'exit(extension_loaded("intl") && class_exists("Locale") ? 0 : 1);'
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY restore-workspace-acl /usr/local/bin/restore-workspace-acl
RUN chmod 0755 /usr/local/bin/restore-workspace-acl
RUN groupadd --gid 10001 sandbox \
 && useradd --uid 10001 --gid sandbox --create-home --shell /usr/sbin/nologin sandbox
