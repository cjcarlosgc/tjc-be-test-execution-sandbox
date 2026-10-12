# Análisis SDD — carpeta contenedora única y `projectRoot` (propuesta WI-SANDBOX-006)

Fecha: 2026-10-12. Estado: `DEFERRED — backlog P2` por decisión del usuario (2026-10-12); no hay WI abierto y no se modificó código ni VM. Motivo: Core confirmó que el flujo real envía ZIP plano; el caso afectado es solo el ZIP subido a mano con carpeta contenedora. Se retoma si ese caso pasa a ser flujo soportado.
Origen: smoke remoto d6f8a87e-273f-4e6f-8d8f-a3b6fbac138b → `UNSUPPORTED_RUNNER` «project does not declare or configure PHPUNIT» (PHP, `projectRoot: "."`, ZIP con carpeta contenedora única).

## Hechos verificados

1. **Es una regresión de WI-SANDBOX-001 (`1139abc`), no una laguna original.** `resolveProjectRoot(workspacePath)` detectaba de forma no destructiva la única carpeta de nivel superior (ignorando `__MACOSX`, `.DS_Store`) y devolvía su ruta; `1139abc` lo reemplazó por «resolver exclusivamente el valor de Core» y eliminó esa detección. Un aplanado **físico** ya se había probado y revertido antes (`81753f9`) porque desalineaba `artifact.relativePath`.
2. **Afecta a PHP y a Node.** `NODE_TYPESCRIPT` solo acepta `projectRoot = .` (`executions.service.ts:217-223`), así que un ZIP de GitHub con wrapper deja Node sin forma de llegar a `package.json`/`pnpm-lock.yaml` (`UNSUPPORTED_PACKAGE_MANAGER`/`UNSUPPORTED_RUNNER`). La prueba `execution-pipeline.service.spec.ts:448` pasa solo porque inyecta `projectRoot: 'my-project'` directamente.
3. **Docs internos desalineados:** el comentario `execution-pipeline.service.ts:115-116` y la nota de `spec/transversal/temporary-workspaces/tasks.md` describen una detección que ya no existe.

## Qué fija y qué no fija el contrato (INTEROP-2.8 §6.1/§7.2)

- Fija: `projectRoot` «se normaliza y valida bajo la **raíz lógica extraída del snapshot**» y «**el wrapper incidental de extracción no integra el valor**». Lectura natural: `projectRoot = .` significa el interior del wrapper; Core no incluye el nombre del wrapper. Esto apunta a (a) para `projectRoot`.
- Fija: Core copia `effectiveProjectRoot` sin re-resolver; Sandbox «no detecta ni elige» **proyectos/candidatos** (WI-001). Quitar un wrapper de extracción no es elegir proyecto.
- **No fija:** la base de `ExecutionArtifactInput.relativePath`. Dice «relativo a `repositoryRoot`» sin precisar si `repositoryRoot` incluye el wrapper. El comportamiento histórico (y la prueba) es relativo a la estructura original, **wrapper incluido**. Si Core ahora envía rutas sin wrapper, aplicarlas contra la raíz cruda las deja fuera del proyecto.

## Opciones

- **(a) Restaurar la detección lógica solo para resolver `projectRoot`** contra `logicalRoot` (única entrada de nivel superior que es directorio, ignorando `__MACOSX`/`.DS_Store`; sin mover nada; conservando confinamiento y rechazo de symlink/zip-slip). Los artefactos se siguen resolviendo contra la raíz cruda. Mínimo, no destructivo, arregla PHP y Node. Riesgo: si Core envía artefactos sin wrapper, quedan fuera del proyecto.
- **(b) (a) + resolver artefactos contra `logicalRoot`.** Coherente si Core envía rutas sin wrapper; rompe el comportamiento histórico/prueba si las envía con wrapper.
- **(c) Core entrega ZIP plano.** No depende del Sandbox, pero Core tendría que re-empaquetar zipballs de GitHub; invalida «Core copia exactamente»/snapshot por hash.

## Recomendación

(a), condicionada a un único dato que solo Core tiene: **si `ExecutionArtifactInput.relativePath` incluye o no el wrapper** en ZIPs de GitHub. Si lo incluye → (a) tal cual. Si no lo incluye → (b). Cambio de contrato: ninguno en (a); en (b) solo precisar texto de §7.2 (aclaración, no cambio de forma). Pruebas mínimas: wrapper único (PHP y Node), varias entradas → sin aplanar, `__MACOSX` ignorado, `projectRoot` con wrapper explícito sigue válido, symlink-escape y zip-slip siguen rechazados, `projectRoot: .` sin wrapper intacto.

## Requisitos de proceso

Abrir WI-SANDBOX-006 requiere aprobación del usuario (hoy WI-005 sigue activo, pendiente de evidencia VM) y trazabilidad (`Refs: HU11`, ya decidida para este frente). No tocar la VM ni desplegar hasta entonces.
