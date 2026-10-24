# Entrega y trazabilidad Git

**Estado:** APROBADO
**Alcance:** RAG Core API, GitHub Integration API, Developer Console y Test Execution Sandbox

## Versión SDD conjunta

- La línea base vigente es SDD 3.1 / Harness V3, común a los cuatro repositorios. `planningBaseline: 2026-09-24-core-console-transition` se conserva solo como marca histórica de la adopción por etapas y como referencia de fecha para Contract Sync.
- Todo cambio de reglas del SDD o del Harness se define primero en Core y se replica a los demás repositorios en el mismo corte de trabajo (ver `harness/README.md` de Core, «checklist de homologación»).
- `SYSTEM-*` e `INTEROP-*` mantienen versionado propio y solo cambian cuando cambia su contrato correspondiente; esta copia solo los espeja.

## Unidad de commit

- Un commit representa un cambio coherente, revisable y verificable; no equivale mecánicamente a una HU.
- Una HU puede requerir varios commits y un commit puede abarcar varias HU cuando el corte sea realmente transversal.
- El commit no debe mezclar cambios independientes solo para reducir la cantidad de commits y debe dejar el repositorio en un estado verificable.
- Un agente autónomo commitea por su cuenta al cerrar cada corte lógico (sin pedir autorización previa para ese acto), siempre que el corte esté verificado (pruebas/lint/build aplicables en verde) y cumpla `Trazabilidad obligatoria`. Esta autonomía cubre únicamente `git commit`; no se extiende a `git push` (ver `Puerta de push`).

## Trazabilidad obligatoria

Todo commit creado por el equipo o por un agente debe usar un asunto compatible con Conventional Commits y declarar en el cuerpo todas las HU afectadas:

```text
<type>(<scope>): <resultado observable>

Refs: HUxx[, HUyy...]
```

- Los IDs de `Refs` deben existir en `spec/backlog.md`.
- Un cambio de SDD, arquitectura, refactor o infraestructura también referencia las HU cuyo diseño, implementación o verificación afecta.
- Si el cambio responde a decisiones, puede agregar `Decisions: DEC-...`; esa línea no sustituye `Refs`.
- Si no es posible identificar una HU afectada, el cambio debe asociarse primero a un work item del backlog; no se inventan IDs ni se hace el commit sin trazabilidad.

## Revisión

La entrega tiene dos niveles de revisión:

1. **Revisión del work item:** el estado `IN_REVIEW` verifica el corte de una o más HU antes de `DONE`, según `harness/WORKFLOW.md`.
2. **Revisión consolidada del sprint:** antes de cualquier push, el reviewer revisa de forma independiente el rango completo de commits que se pretende publicar, no solo cada commit por separado.

La revisión consolidada comprueba como mínimo:

- coherencia y trazabilidad `Refs` de cada commit;
- correspondencia del diff acumulado con las HU y specs aprobadas;
- ausencia de decisiones bloqueantes o ampliaciones silenciosas de alcance;
- pruebas, lint y build aplicables en verde;
- manejo de errores, seguridad, observabilidad y limpieza;
- resolución y nueva revisión de cualquier hallazgo.

El resultado se registra en `harness/reports/sprint-<N>-review.md` con el rango o commit final revisado, HU incluidas, verificaciones ejecutadas, hallazgos y veredicto `APPROVED` o `CHANGES_REQUESTED`. Para una entrega extraordinaria fuera del cierre se usa `harness/reports/delivery-<scope>-review.md`.

El reporte puede incorporarse después de la aprobación mediante un commit exclusivo de evidencia `docs(review): ...`. Esa única diferencia no invalida el veredicto si el reviewer comprueba antes del push que el commit solo modifica los reportes declarados y conserva las mismas HU; cualquier otro cambio sí exige repetir la revisión completa.

## Delegación entre sesiones de agente

- La sesión coordinadora es **cross** (carpeta raíz `Tesis/`). Ningún repositorio es la sesión coordinadora: cada uno trabaja dentro de su propio SDD y Harness.
- Cross envía handoffs a la sesión de cada componente sin pedir confirmación previa al usuario. Cada handoff es autocontenido (alcance, decisiones ya tomadas, criterio de terminado) y pide responder a cross.
- Una sesión que recibe un handoff lo ejecuta con su propio flujo (WI, reviewer, gates) y responde a cross al terminar o al bloquearse con resultado, evidencia y pendientes. Un handoff no modifica por sí solo la fuente de verdad.
- Excepcionalmente el usuario puede pedir que un cambio compartido lo ejecute la propia sesión cross sobre varios repositorios; esa autorización vale solo para ese cambio.
- El trabajo se hace siempre en `feature/jean`. El merge a `develop` y todo push, PR o cambio de `main` los ordena el usuario en cada ocasión.

## Puerta de push

- Por defecto se realiza un push por repositorio al cierre de cada sprint.
- Solo puede publicarse el commit final exacto que recibió veredicto `APPROVED`, salvo el commit exclusivo de evidencia definido arriba; cualquier otro cambio posterior invalida la aprobación y requiere una nueva revisión.
- No se hace push con hallazgos abiertos, verificaciones requeridas fallidas ni cambios relevantes sin revisar.
- Un push extraordinario antes del cierre del sprint requiere autorización humana explícita y debe superar la misma revisión previa.
- A diferencia del commit (ver `Unidad de commit`), el push nunca es autónomo: todo push, sea de cierre de sprint o extraordinario, requiere una solicitud explícita del usuario en esa instancia concreta; una autorización previa no cubre pushes futuros.
