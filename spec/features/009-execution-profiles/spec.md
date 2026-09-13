# 009 — Execution profiles

**Estado:** APROBADO
**Story IDs:** HU43
**Contrato:** SYSTEM-2.0 / INTEROP-2.0

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
