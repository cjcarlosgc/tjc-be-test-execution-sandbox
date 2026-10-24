Modelo: sdd-analyst · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-017 — análisis SDD

**Veredicto: SPEC_VERIFIED** (con lugares documentales a actualizar, listados abajo; ninguno es hueco de spec bloqueante).

## 1. Digests (coinciden con CS-CORE-20261021-004)
- system-contract.md: f60d6c4b…6ce3 (OK)
- interoperability-contract.md: f9866d16…c6f9 (OK)
- árbol spec/contracts/schemas: a1ba9a19…9091 (OK, sin diff en schemas)

## 2. git diff -- spec/contracts
Solo cambian system-contract.md e interoperability-contract.md (cabeceras INTEROP-2.19 / SYSTEM-2.14, fecha 2026-10-21).
- system: nueva DEC-EXP-005 (Blocks: NONE, enmienda DEC-EXP-004, config única del LLM de Core), enmienda en DEC-EXP-004 y párrafo de changelog SYSTEM-2.14 (único hit de «Sandbox»: describe espejos).
- interop: línea de versión vigente (§1, "sin cambio de rutas, DTO, enums ni códigos de error") y líneas de §6.5/§6.5.1 (experimentos de Core: modelo/esfuerzo, 422 REASONING_EFFORT_UNSUPPORTED solo por temperatura).
- Sin cambios en §7 (ejecución), §4/§4.1 (errores genéricos), idempotencia, auth ni schemas. Impacto en el comportamiento del Sandbox: ninguno (solo homologación documental).

## 3. Referencias de versión desactualizadas (fuera de reports/legacy/contracts)
Actualizar a SYSTEM-2.14 / INTEROP-2.19:
- AGENTS.md:19 — «hoy SYSTEM-2.13 e INTEROP-2.17» -> «hoy SYSTEM-2.14 e INTEROP-2.19» (ya estaba atrasado respecto a 2.18).
- spec/README.md:9 — «hoy SYSTEM-2.13 e INTEROP-2.17» -> «SYSTEM-2.14 e INTEROP-2.19».
- README.md raíz: sin referencias.

No requieren cambio (histórico o cita de versión puntual correcta):
- CHANGELOG.md:3, :12 (históricos; añadir entrada nueva para WI-017).
- spec/features/001-execution-api/tasks.md:10, :11 (tareas cerradas históricas); :13 es ST-SANDBOX-017 (propio WI, ya menciona 2.14/2.19).
- spec/features/009-execution-profiles/tasks.md:14 (SYSTEM-2.12 histórico).
- spec/backlog.md:112 (INTEROP-2.18 §4.1, ya implementado por WI-015; los códigos de §4.1 no cambian en 2.19; opcional).
- app/src/common/http/http-exception.filter.generic.spec.ts:22,:74 («INTEROP-2.18 §4.1») y app/src/executions/executions.contract.spec.ts:18,:62 («INTEROP-2.17 §7…»): comentarios/títulos de test; las secciones citadas no cambian. Opcional actualizar a 2.19; no se recomienda tocar código en un WI documental (decisión del leader).
- harness/state.json:656,:1286 y work-items.json (históricos).

## 4. DEC con Blocks sobre WI-SANDBOX-017
Ninguna. DEC-EXP-005 declara «Blocks: NONE» (system-contract.md, sección tras DEC-EXP-004) y concierne a Core. grep de WI-SANDBOX-017 en spec/ solo halla ST-SANDBOX-017 (spec/features/001-execution-api/tasks.md:13, T-READY).

## Lugares exactos a actualizar
1. AGENTS.md:19
2. spec/README.md:9
3. CHANGELOG.md (entrada nueva)
4. spec/features/001-execution-api/tasks.md:13 (marcar [x] al cerrar)
