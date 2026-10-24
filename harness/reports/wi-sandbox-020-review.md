Modelo: reviewer · configurado claude-sonnet-5-5 · atendido claude-sonnet-5-5 · esfuerzo medium

# Revisión independiente — WI-SANDBOX-020

Veredicto: **APPROVED** (0 BLOCKER, 0 MAJOR, 3 MINOR informativos).

- Rango revisado: `git diff origin/feature/jean..adbcef2` (commit `adbcef2`, 10 archivos). HU: HU11. Trazabilidad: el commit lleva `Refs: HU11`.
- Fecha: 2026-10-24. Entorno: Podman rootless, Node 22, pnpm 12.14.0.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `node harness/validate-work-items.mjs` | OK (12 WI) |
| `node harness/validate-harness.mjs` | OK |
| `node harness/validate-completions.mjs` | OK (11 WI completados) |
| `pnpm lint` | 0 errores |
| `pnpm test` | 319 pasan, 5 omitidos (36 archivos, 1 omitido) |
| `pnpm build` | OK |
| `pnpm contracts:check` | OK |
| Imagen existente `tjc-sandbox-php:8.3-nonroot` | `php -m` incluye `intl`; `Locale` existe; `NumberFormatter('es_PE')` da `S/ 1,234.50`; `id sandbox` = 10001; `setfacl`, `getfacl`, `unzip`, `composer`, `restore-workspace-acl` presentes |
| Reconstrucción independiente con tag propio `rev020-test` (borrado después) | Build OK, la comprobación interna de `intl` pasa; mismo resultado funcional (reproducible) |
| Diff de paquetes `dpkg` entre `php:8.3-cli` y la imagen reconstruida | Solo se añaden `acl`, `unzip` y `libicu76:amd64` (ICU de runtime). No queda ningún paquete `-dev`, `libicu-dev` ni toolchain extra: la purga es limpia y no quita `acl`/`unzip` |
| e2e real PHP (`full-pipeline.e2e-spec.ts -t PHPUnit`) con el servicio Podman temporal (`keep-id:uid=10001`) | 3 pasan, 3 omitidos (los del filtro); incluye la aserción `extension_loaded('intl')` y `Locale::getDisplayLanguage('es','es') === 'español'` junto a UID 10001. Servicio detenido por PID tras comprobar `/proc/<pid>/comm` = `podman` |

Nota: el e2e usó la imagen ya construida (que corresponde al Dockerfile nuevo), no una construcción desde cero por el Sandbox; la construcción desde cero se verificó aparte (fila de reconstrucción).

## Criterios de aceptación del WI

1. `intl` en la imagen y el build falla si no carga (`php -r 'exit(extension_loaded("intl") && class_exists("Locale") ? 0 : 1)'` al final del `RUN`): cumple.
2. Purga: solo ICU de runtime, mismos paquetes que la base más `acl`/`unzip`/libicu; Composer y usuario 10001 presentes: cumple.
3. e2e PHP afirma `intl` dentro del PHPUnit generado junto a la identidad 10001: cumple. El escape `\\Locale` dentro del template literal TS produce `\Locale` en PHP; el test pasa.
4. Sin cambio de etiqueta/nombre, UID, CapDrop, red, límites ni contrato; reconstrucción manual por host documentada (runbook en el reporte de implementación y nota en spec/CHANGELOG): cumple. El diff no toca `app/src`, esquemas ni `contracts`.
5. Lint, unit, build, contracts:check y validadores: verificados arriba. Coherencia spec/plan/tasks: la regla 1 de la spec 009 y las secciones nuevas de spec/plan/tasks/README/CHANGELOG son consistentes entre sí y con el Dockerfile.

## Hallazgos

- **BLOCKER:** ninguno.
- **MAJOR:** ninguno.
- **MINOR-1 (proceso):** excepción de roles, evaluada abajo.
- **MINOR-2:** `tasks.md` deja `ST-SANDBOX-020` sin marcar (`[ ]`, `T-IN_PROGRESS`); es correcto mientras el WI está en `W-IN_REVIEW`, pero debe pasar a `[x]`/`T-DONE` al cerrar (responsabilidad del leader en el cierre, no en este reporte).
- **MINOR-3:** el e2e PHP real no es reproducible en Podman rootless sin el setup especial (servicio temporal con `keep-id`); es una limitación de entorno preexistente, ya documentada en el reporte de implementación, y no afecta a la VM (Docker rootful). Además, la reconstrucción manual de la imagen por host es un paso operativo obligatorio (el Sandbox solo construye si falta); el runbook lo cubre, con respaldo y reversión.

## Evaluación de la excepción de roles

El leader implementó directamente el cambio de `app/docker/php/Dockerfile`, que supera el umbral de "cambio mínimo" de `AGENTS.md` y debió delegarse a `implementer`. Evaluación: la desviación existe y es real, pero (a) fue declarada de forma explícita en el reporte de implementación y en el registro del WI, (b) respondía a un pedido directo del usuario con decisión registrada, (c) el WI es STANDARD sin impacto de contrato, (d) esta revisión es independiente (el reviewer no participó en la implementación) y reprodujo el build, la comparación de paquetes y el e2e, y (e) el cambio no incumple ninguna salvaguarda técnica. Conclusión: **excepción aceptada como desviación de proceso no bloqueante (MINOR)**; no invalida el trabajo ni exige reimplementación. Recomendación para futuros WI: delegar cambios no mínimos de Dockerfile/profiles al `implementer`. Esta aceptación no sustituye una aprobación del usuario sobre la política de roles; el usuario ya conoce la excepción por haber pedido el cambio.

## Controles de aislamiento (`isolationChecksPassed`: true)

- UID/GID del usuario `sandbox` sigue en 10001 (verificado en la imagen y por el e2e).
- `CapDrop: ['ALL']`, red de la etapa de tests, límites de recursos, montajes y flujo ACL: sin cambios (el diff no toca código de producto, solo el Dockerfile, que no modifica el entrypoint ni la capa `acl`/`unzip`/ACL script).
- La imagen no añade herramientas de compilación ni paquetes `-dev` (superficie de ataque equivalente a la base más ICU de runtime, +36 MB).
- La compilación ocurre en build time con red, fuera de las ejecuciones; no se añaden secretos, usuarios ni capabilities.
- Contrato HTTP sin cambio (`contractImpact=false`, `publishesContract=false`); `contracts:check` OK.

## Recomendación

Cerrar el WI: marcar `ST-SANDBOX-020` como hecho, pasar a `W-DONE` con este reporte como evidencia de revisión, y ejecutar el runbook de reconstrucción de imagen en la VM al desplegar.
