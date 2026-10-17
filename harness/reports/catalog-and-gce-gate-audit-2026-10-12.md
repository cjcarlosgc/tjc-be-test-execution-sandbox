# Auditoría de catálogo y gate GCE — 2026-10-12

## Fuente canónica local

Para el Test Execution Sandbox, `spec/README.md` establece que `spec/` es la
fuente de verdad y que `spec/backlog.md` se consulta antes de seleccionar un
corte funcional. El backlog vigente no termina en HU18: conserva el catálogo
histórico HU01–HU29 y añade el catálogo SDD 2.0 HU30–HU47.

Por tanto, una vista de Core o Console limitada a HU01–HU18 no puede sustituir
ni recortar el catálogo local sin una homologación SDD explícita. Esta auditoría
no modifica la numeración, no inventa historias y no trata HU47 como aprobada.

## GCE / infraestructura remota

- Historia vigente aplicable: **HU47 — Desplegar Sandbox remoto** (EP15,
  Infra, P2).
- Gate obligatorio: **DEC-INF-001**, `PENDING` en
  `spec/contracts/system-contract.md`.
- `Blocks` de DEC-INF-001: aprovisionamiento remoto. Su pregunta exige decidir
  proveedor y controles de VM, costo, aislamiento, red y retención; menciona
  Docker local solo como prevalidación permitida.
- Gate adicional condicionado: **DEC-VAL-001** continúa `PENDING` si se pretende
  ingerir/desplegar código empresarial o producir evidencia empresarial.

No existe un work item de infraestructura remota seleccionado o aprobado en
`harness/state.json`. HU47 es la historia candidata del catálogo vigente, pero
no autoriza crear VM, GCE, despliegue ni seleccionar proveedor. Un work item
posterior solo puede abrirse después de que el usuario resuelva DEC-INF-001 y,
si corresponde, DEC-VAL-001.

## Estado de coordinación

La divergencia reportada con los catálogos de Core/Console requiere
homologación interrepositorio; no se corrige unilateralmente desde Sandbox. No
hay cambio contractual que publicar ni infraestructura que desplegar.
