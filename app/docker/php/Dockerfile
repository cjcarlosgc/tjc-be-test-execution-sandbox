# Imagen gestionada del profile PHP_LARAVEL_PHPUNIT (009, corte T-003).
# ContainerRunner la construye vía Docker API la primera vez que falta en el
# host. Contiene solo runtime: nunca código del proyecto ni credenciales.
#
# - php:8.3-cli ya incluye las extensiones que exige un Laravel 12 típico
#   (ctype, dom, fileinfo, mbstring, openssl, tokenizer, xml, pdo_sqlite...).
# - unzip: Composer lo necesita para extraer paquetes (la imagen base no
#   trae ni unzip ni ext-zip).
# - Composer 2 en el PATH, copiado de la imagen oficial.
ARG PHP_IMAGE=php:8.3-cli
ARG COMPOSER_IMAGE=composer:2

FROM ${COMPOSER_IMAGE} AS composer

FROM ${PHP_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
