# 009 — Plan

## Cortes posteriores

1. Resolver y validar `ExecutionProfile`/`TestRunner`.
2. Preservar contract tests del profile Node.
3. Construir imagen PHP/Composer reproducible y adapter PHPUnit.
4. Normalizar pass/fail/configuration/timeout y evidencia.
5. Verificar aislamiento, red por etapas, límites y cleanup para ambos profiles.

T-001 solo consolida contrato y planificación; no modifica `app/` ni infraestructura.

## Corte T-003 — Validación PHP/Laravel (HU43)

1. Imagen gestionada: Dockerfile `app/docker/php/Dockerfile`, build vía Docker API si falta; quitar `apt-get` y `capAdd` de la instalación PHP.
2. Instalación sin scripts y entorno de testing (`APP_ENV`, `APP_KEY` aleatorio) solo en el container de tests PHP.
3. `phase` opcional en DTO/registro/huella; `buildCommand` recibe las rutas de tests seleccionadas relativas al proyecto.
4. `failureKind` en los tres parsers; detección de `ParseError` PHP; borrado previo del archivo de resultados.
5. Default de memoria a 1 GiB.
6. Unit tests por cada regla; e2e real PHP (selección + `ERROR` vs `ASSERTION`) sobre Docker API (Docker Desktop o socket Podman).
7. `CONTRACT_SYNC` hacia Core por `failureKind` y por la tolerancia de `phase`.

## WI-SANDBOX-001 — `projectRoot` Core→Sandbox (HU43)

1. Importar y validar el `projectRoot` opcional de INTEROP-2.8; ausencia significa `.`.
2. Resolverlo bajo la raíz lógica extraída del snapshot y rechazar path absoluto, traversal, inexistencia, normalización no válida o escape por symlink antes de instalar dependencias o ejecutar código.
3. Usar `repositoryRoot/projectRoot` como cwd de Composer/PHPUnit; conservar `ExecutionArtifactInput.relativePath` repo-relative en materialización y evidencias.
4. Incluir el root normalizado en la huella de idempotencia según el contrato; preservar el comportamiento de Node con `.`.
5. Añadir pruebas de root, raíz anidada, omisión legacy, traversal/symlink, cwd y rutas de artefactos; ejecutar validadores, lint, tests, build y prueba Docker aplicable antes del review.

No cambiar `sddVersion`, `SYSTEM-2.2`, la cardinalidad de binding ni infraestructura externa.
