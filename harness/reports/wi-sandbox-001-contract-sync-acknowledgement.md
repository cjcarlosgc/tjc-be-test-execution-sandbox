# WI-SANDBOX-001 — Acuse de Contract Sync

**Estado:** `C-ACKNOWLEDGED`; el acuse no declara implementado el campo.

- Evento: `CS-CORE-20261011-002`, fuente `WI-CORE-037`, revisión `187b0383817e341aa7c82e91cb36d7dcce343479`.
- Contrato importado: `INTEROP-2.8` desde Core; SHA-256 `755c3357ca047ede9fb318a40a594cc68a63fc63f2b9f4c58af93c28f51a8d90`.
- Alcance: registrar `WI-SANDBOX-001` para validar `projectRoot`, ejecutar Composer/PHPUnit con ese cwd y conservar las rutas de artefactos relativas al repositorio. La omisión legacy equivale a `.`.
- No se cambia `app/`, `sddVersion` (sigue `2.1`), `SYSTEM-2.2`, la regla de un Project por repositorio ni infraestructura. Sandbox no detecta ni elige el root.
- La implementación y las pruebas quedan pendientes del WI; este reporte acredita importación, alcance y aceptación.
- Validación del corte de sync: `node harness/validate-harness.mjs` — PASS; `git diff --check` — PASS. `node scripts/sdd-check.mjs` devuelve `schemaVersion no soportado` en el Harness V2 preexistente; no se migra ese validador ni se afirma que el gate SDD pase.
