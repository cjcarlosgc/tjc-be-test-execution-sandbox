# Fase 2 — Diagnóstico de estabilización del Sandbox (solo lectura)

Fecha: 2026-10-13. Alcance: **diagnóstico y propuesta mínima**. No se implementó nada, no se tocó la VM, el firewall ni el proxy, no hay push ni deploy. Cada corrección requiere la aprobación de alcance de Jean (frases al final).

Objetivo declarado por Jean (vía Cross): «seguir puliendo lo ya construido; no contradecir el paper ni la tesis», sin funcionalidades nuevas. Invariantes que ninguna propuesta toca: el Sandbox **no recibe tokens de GitHub ni Functional Knowledge**, ejecuta de forma **aislada** (UID 10001, `CapDrop: ALL`, red solo en instalación), devuelve **hechos** y no conclusiones.

Convención: **Verificado** = comprobado en este repo / Core local en esta sesión. **Reportado** = lo dijo otra sesión; el Sandbox no lo verificó. **No verificado** = sin evidencia disponible.

---

## 1. Contract Sync y espejos

**Evidencia (verificado).** Bandeja `harness/contract-sync/inbox/`: 5 eventos, **todos `ACKNOWLEDGED`, ninguno `PENDING`**; `check` sin pendientes relevantes.

| Evento | Qué exige | Estado |
|---|---|---|
| CS-CORE-20261011-002 | INTEROP-2.8: `projectRoot` bajo `repositoryRoot`, cwd de Composer/PHPUnit; implementado (WI-SANDBOX-001) | acusado (implementado) |
| CS-CORE-20261012-001 | DEC-INF-001 operativo: reutilizar la VM, verificar SHA | acusado |
| CS-CORE-20261012-002 | corrección de procedencia de -016; sin acción para el Sandbox | acusado (informativo) |
| CS-CORE-20261012-010 | SYSTEM/INTEROP-2.11 editorial; DEC-INF-002 `PROPOSED` | acusado; reemplazado por -012 |
| CS-CORE-20261012-012 | SYSTEM-2.12: DEC-INF-002 aprobada as-built; ratificar rate limit y rotación | acusado; valores ratificados por Cross |

**Faltante de acuse.** Core publicó **un** evento dirigido a `sandbox` que no está en la bandeja: **`CS-CORE-20261009-016`** (INTEROP-2.7 §7: `failureKind`, `phase`, `TEST_COMPILATION_FAILED`, `IMAGE_UNAVAILABLE`). Su contenido **ya está implementado y espejado** (el espejo del Sandbox contiene esas secciones y el código emite esos hechos); solo falta el registro. `-003…-009` y `-011` apuntan a `console`/`github-integration`.

**Espejos frente a Core (verificado).**
- Core está en **SYSTEM-2.12 / INTEROP-2.15**; el espejo del Sandbox declara SYSTEM-2.2 / INTEROP-2.8 (cuerpo 2.7/2.8).
- **La sección que consume el Sandbox (§7 «RAG Core ↔ Test Execution Sandbox») es idéntica entre ambas copias**, salvo **una línea** (estado de `DEC-INF-001`: `PENDING` en el espejo, `APROBADO` en SYSTEM-2.9). Es decir, **no hay deriva de comportamiento**: lo que difiere es cabecera y secciones de Console/Core que el Sandbox no usa.
- Core documenta que «Sandbox mantiene la línea base anterior» y su CHANGELOG registra que el Sandbox permanece en `sddVersion 2.1` por decisión del usuario (los otros tres repos están en `3.0`, con Harness V3; el Sandbox usa Harness V2).
- El espejo no refleja `DEC-INF-001` aprobada ni `DEC-INF-002` as-built (TLS + Caddy + `rag-sandbox-https-allow`); la realidad operativa solo vive en `harness/reports/`.

**Causa.** Decisión consciente de no migrar el Sandbox a SDD 3.0/Harness V3 mientras se trabaja en él; los eventos de Core posteriores a 2.8 no cambiaron §7.

**Cambio mínimo.**
1. Importar y acusar `-016` como informativo (solo docs/harness).
2. **No** migrar a 3.0. Dejar una nota explícita de divergencia (SDD 2.1 / INTEROP-2.8 vigente para el Sandbox porque §7 es idéntico) y copiar solo el estado de `DEC-INF-001`/`DEC-INF-002` al espejo.
- Alternativa descartada por no ser mínima: copiar SYSTEM-2.12/INTEROP-2.15 byte a byte y subir a `sddVersion 3.0`, que arrastra la migración a Harness V3.

**Riesgo.** Bajo. Riesgo de documentación desalineada si Core cambia §7 en el futuro: ya lo cubre `contract-sync check` en cada checkpoint.
**Paper/tesis.** No roza nada: es administrativo.

---

## 2. `develop` atrasada respecto de `feature/jean`

**Evidencia (verificado).** `origin/develop` = `11f5d9e` (merge del PR #4); `origin/feature/jean` = `5070355`. `develop` es **ancestro** de `feature/jean`: `feature/jean` está **15 commits por delante** y `develop` no tiene nada que `feature/jean` no tenga → **avance rápido posible**, sin conflictos. `main` es ancestro de `develop`.

**Causa.** Todo el trabajo de WI-SANDBOX-001…005 se hizo y desplegó desde `feature/jean`; la VM corre `feature/jean` (reportado).

**Riesgo.** `develop` **no contiene** `projectRoot` (INTEROP-2.8), PHP no-root UID 10001 de la VM, ACL, la clasificación `INFRASTRUCTURE`, ni los runbooks. Cualquier consumidor que construya desde `develop` (la intención registrada del 2026-09-19 era que Render desplegara desde `develop`; **no se verificó** si algún servicio lo hace hoy) ejecutaría código que falla el perfil PHP en Linux. Además `main`/`develop` no reflejan lo que corre en producción.

**Cambio mínimo.** Un PR de `feature/jean` → `develop` (o avance rápido por Jean), sin cambios de contenido. `develop` → `main` queda a criterio de Jean según su flujo. Requiere push/PR explícito.

**Paper/tesis.** Ninguno.

---

## 3. Evidencia: qué devuelve hoy y qué costaría ampliar

**Evidencia (verificado en contrato §7.3 y en `execution-pipeline.service.ts`).** El resultado **ya incluye**:
- `evidence[]`: `TEST_STDOUT`, `TEST_STDERR` (acotados a **8 KiB** cada uno, con `truncated` y `originalBytes`) y `RUNNER_REPORT`.
- `stageDurations[]`: duración por etapa (`PREPARING`, `INSTALLING_DEPENDENCIES`, `RUNNING_TESTS`).
- `startedAt` / `completedAt` de la ejecución completa.
- En fallo: `failure {stage, category, code, message}` y la evidencia acumulada hasta ese punto.

**Lo que no hay:**
- stdout/stderr de la **instalación** (solo un fragmento de ≤500 caracteres dentro de `failure.message` cuando falla; en éxito, nada).
- marcas de inicio/fin **por etapa** (solo duraciones).
- la recuperación ACL (WI-005) no es una etapa ni aparece en `stageDurations`.

**Cambio mínimo y costo.**
- *Timestamps por etapa:* campo opcional `startedAt`/`completedAt` en `StageDuration`. Cambio aditivo de contrato → INTEROP aditivo + Contract Sync; Core debe ignorar campos desconocidos (regla del contrato §1). Esfuerzo pequeño (el pipeline ya mide `Date.now()`). Sin datos sensibles.
- *Logs de instalación acotados:* exige **nuevos valores** en la unión `ExecutionEvidenceKind` (p. ej. `INSTALL_STDOUT`/`INSTALL_STDERR`). Toca contrato y **depende de que Core no valide la unión de `kind` de forma cerrada** (no verificado: Cross confirmó que Core no whitelistea `failure.code`, pero no `evidence.kind`). Mayor tamaño de payload.

**Riesgo.** Los logs de instalación son salida de código de terceros ya truncable; el entorno del contenedor solo lleva `COMPOSER_HOME`/`COMPOSER_CACHE_DIR` (sin secretos), pero Core debería aplicar su saneamiento habitual (§6.16 / `WI-CORE-027`).
**Recomendación:** solo los timestamps por etapa, y únicamente si Core los necesita para el análisis; **no** los logs de instalación sin una necesidad concreta.
**Paper/tesis.** Son hechos neutrales; no contradice «devuelve hechos, no conclusiones». No afecta aislamiento ni tokens.

---

## 4. ~20 s por ejecución: qué es `composer install` y qué ya existe

**Evidencia.**
- *Verificado (código):* instalación = `composer install --no-interaction --no-progress --prefer-dist --no-scripts` con red; respeta `composer.lock`; **ya existe un volumen de caché compartido** (`sandbox-composer-cache`, `COMPOSER_CACHE_DIR`), inicializado una vez por proceso. Por ejecución hay **tres contenedores** (instalación, pruebas y, desde WI-005, la recuperación ACL), cada uno con su costo de arranque, más la provisión del workspace y la extracción del snapshot.
- *Verificado:* el servicio devuelve `pollAfterMs = 2000` por defecto (`SANDBOX_POLL_AFTER_MS`) y Core consulta con ese intervalo → hasta ~2 s de latencia de detección por ejecución.
- *Reportado:* smoke remoto con etapas 747 / 3441 / 668 ms (~4,9 s) frente a **19–25 s** `executionDurationMs` en el piloto OE5 (54 trials).

**Causa.** **No determinada.** La diferencia entre ~5 s y ~20 s no se explica con el código del Sandbox. Hipótesis **no verificadas**: proyectos del piloto con más dependencias que el smoke; caché fría tras reconstruir la imagen o el volumen; latencia de polling de 2 s; costo de arranque de contenedores; cómo se mide `executionDurationMs` en Core (si incluye cola/espera).

**Cambio mínimo.**
1. **Medir antes de cambiar:** Core ya persiste `stageDurations` por ejecución; extraer su distribución (instalación vs pruebas vs preparación) para los 54 trials. Costo: cero código.
2. Solo si la instalación domina y la caché está fría: confirmar que el volumen persiste entre ejecuciones (los tiempos de la primera vs siguientes).
3. Si la latencia de detección pesa: bajar `SANDBOX_POLL_AFTER_MS` (configuración, sin código) — ojo con el rate limit (600 GET/min por IP): a 500 ms son ~120 GET/min por ejecución activa.

**Lo que NO se propone:** quitar `--no-scripts`, quitar el aislamiento de red o de capabilities, omitir la recuperación ACL, ni `--no-dev` (PHPUnit es dependencia de desarrollo).
**Riesgo.** Bajo en medir; moderado en tocar `SANDBOX_POLL_AFTER_MS` (más tráfico).
**Paper/tesis.** Ninguno si se mantiene el aislamiento; los tiempos reportados en la tesis no deberían cambiar de definición.

---

## 5. Defectos conocidos y logs de la VM del 2026-10-13

**Logs de la VM: no verificado.** El Sandbox no tiene acceso a la VM y este diagnóstico no la toca; no hay datos de 5xx, 429 ni timeouts de hoy. Además, el Caddyfile as-built **no tiene `log`**: un `429` o `5xx` del proxy **no queda registrado** salvo errores del propio Caddy. Por tanto la ausencia de evidencia de 429 en los experimentos **no demuestra** que no los hubo (y un `429` sesgaría métricas porque Core lo trata como `SandboxUnavailable`).
- El piloto reportó 54 trials y rehearsals sin fallos de infraestructura ni reintentos (reportado por Cross): es consistente con ningún 429/5xx visible desde Core.

**Cambio mínimo (operativo, requiere ventana con 2FA):** habilitar `log` en Caddy (sin cuerpos; `Authorization` se redacta por defecto) y conservar un contador de 4xx/5xx; consultas de solo lectura, p. ej. recuento de `429`/`5xx` por día en el journal.

**Defectos conocidos del código (verificados):**

| # | Defecto | Impacto | Cambio mínimo |
|---|---|---|---|
| K1 | Comentario engañoso en `execution-pipeline.service.ts:115-116` (dice que el extractor «aplanaría» la carpeta contenedora) y nota desactualizada en `spec/transversal/temporary-workspaces/tasks.md` | solo documental | corregir texto |
| K2 | `cleanup()` devuelve `boolean` que el pipeline ignora (solo log); un workspace no borrado depende del barrido por TTL | disco, no funcional | registrar métrica/aviso; sin cambio de contrato |
| K3 | Repositorio de ejecuciones **en memoria**: reiniciar el proceso pierde ejecuciones en curso e idempotencia | rotar token/redeploy debe hacerse en reposo | documentado en el runbook; cambio de diseño fuera de alcance |
| K4 | `NODE_TYPESCRIPT` solo acepta `projectRoot="."`: un ZIP con carpeta contenedora falla | caso residual (ZIP manual), flujo real usa ZIP plano | diferido P2 (`wi-sandbox-006-wrapper-analysis.md`) |
| K5 | Las 2 pruebas con ACL real solo corren en Linux como root; en macOS quedan *skipped* | cobertura | documentar el comando de contenedor Linux usado en WI-005 |
| K6 | Sin tope de concurrencia ni doble token | riesgo operativo, no defecto | backlog técnico ya registrado (requiere análisis de impacto en experimentos) |

---

## Resumen y priorización

| Punto | Acción mínima | Toca contrato | Roza paper/tesis |
|---|---|---|---|
| 1 | Acusar `-016`; nota de divergencia + estado DEC-INF en espejo | No | No |
| 2 | Alinear `develop` con `feature/jean` (avance rápido) | No | No |
| 3 | (Opcional) `startedAt`/`completedAt` por etapa | **Sí, aditivo** | No |
| 4 | Medir `stageDurations` de los 54 trials; luego decidir | No | No |
| 5 | Habilitar log de acceso en Caddy; K1 documental | No | No |

## Frases de aprobación de alcance (para Jean)

- **A1 — Contract Sync (solo docs/harness):** «Autorizo importar y acusar CS-CORE-20261009-016 como informativo y registrar en el Sandbox la divergencia SDD 2.1 / INTEROP-2.8, copiando solo el estado de DEC-INF-001 y DEC-INF-002; sin migrar a SDD 3.0.»
- **A2 — Alinear ramas:** «Autorizo el push de feature/jean y un PR/avance rápido de feature/jean a develop sin cambios de contenido.»
- **A3 — Medición:** «Autorizo extraer y analizar los stageDurations de los trials para decidir si hay algo que optimizar; sin cambios de código.»
- **A4 — Timestamps por etapa (opcional):** «Autorizo añadir startedAt/completedAt opcionales por etapa en StageDuration como cambio aditivo, con Contract Sync a Core.»
- **A5 — Observabilidad del proxy (operativo, con 2FA):** «Autorizo habilitar el log de acceso de Caddy en la VM, sin cuerpos, para detectar 429/5xx.»
- **A6 — Documental:** «Autorizo corregir el comentario de execution-pipeline.service.ts y la nota de temporary-workspaces/tasks.md.»

Hallazgos que **no** se proponen por rozar el diseño experimental o el aislamiento: tope de concurrencia (altera tiempos), logs de instalación como evidencia sin necesidad concreta, y cualquier relajación de red/capabilities.
