Modelo: reviewer · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Revisión independiente — WI-SANDBOX-016

**Veredicto: APPROVED** (0 BLOCKER, 0 MAJOR, 3 MINOR)

## Verificación
1. Script (rc probado con `node .claude/hooks/check-subagent-title.mjs`, JSON por stdin):
   - válida completa (`[implementer::Haiku 5.5] · WI-SANDBOX-015 · …`, `implementer-high`, `sdd-analyst`) → 0
   - ID completo mal formado (`[implementer] WI-SANDBOX-015 x`) → 2; abreviada `WI-015` → 2 (también `(WI-015)`, `x-WI-015`)
   - sin WI, JSON inválido, `{}`, descripción vacía → 0
   - `SWI-1`, `NEWI-3`, `rewi-fi`, `Wi-Fi`, `wi-015` (minúscula) → 0 (no hay falsos positivos; `\bWI-` distingue mayúsculas, confirmado)
   - `WI-SANDBOX-015` sin `::` → 2; con `::` pero sin corte (`… · `) → 2; `WI-SANDBOX-15` → 2; `WI-sandbox-015` → 2
   - Solo el texto literal `WI-FI` en mayúsculas se bloquearía (falso positivo teórico, aceptable).
2. Regex de formato inalterado y coherente con leader.md:15 / WORKFLOW.md:17 (`[<rol>::<modelo>] · WI-… · <corte>`) y agent-profiles.yaml (`implementer-high`, `Haiku 5.5`, `Sonnet 5.5` aceptados por `[a-z][a-z-]*` y `[^\]]+`).
3. Test no tautológico: mutación temporal (regex previo `WI-[A-Z]+-\d{3}` en la línea 13) → `not ok 3 - rechaza menciones abreviadas…` (4 pass / 1 fail). Hook restaurado; `git status` limpio.
4. `node --test harness/*.test.mjs` → 30 pass / 0 fail; sdd-check, validate-work-items, validate-harness, validate-completions → rc 0.
5. Redacción del reporte: el factor 2 se rotula «verificado» y afirma como hecho que el hook no se recarga y que basta reiniciar. La evidencia (un lanzamiento mal formado no fue bloqueado + settings.json creado en c110f84) es consistente, pero es inferencia/hipótesis razonable, no verificada (no se reinició la sesión ni se comprobó la causa). Ver MINOR-1.
6. `.claude/settings.json` no aparece en `git show HEAD --stat`; su único commit es c110f84. No modificado.

## Hallazgos
- MINOR-1 `harness/reports/fast-lane-wi-sandbox-016-subagent-title-hook.md` (sección Causa, punto 2) y `harness/work-items.json` (4.º criterio, «La causa se documenta: el script no estaba activo…»): presentar como hipótesis («probablemente», «pendiente de confirmar al reiniciar») en vez de «verificados»/hecho.
- MINOR-2 `.claude/hooks/check-subagent-title.mjs:13`: `\b` no separa en `_`, así que `x_WI-015` pasa sin validar (falso negativo marginal).
- MINOR-3 `harness/check-subagent-title.test.mjs`: no cubre `::` sin corte ni falsos positivos (`SWI-1`, `Wi-Fi`); el comportamiento es correcto pero sin test de regresión.

## Comandos
`export PATH=$HOME/.local/node/bin:$PATH`; pruebas directas del hook (arriba); mutación con sed + `node --test harness/check-subagent-title.test.mjs` y restauración desde copia; `node --test harness/*.test.mjs`; los 4 validadores; `git status --short`.
