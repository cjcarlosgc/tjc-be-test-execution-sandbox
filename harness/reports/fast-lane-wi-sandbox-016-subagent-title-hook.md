Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Vía rápida — WI-SANDBOX-016 (hook de títulos de subagente)

Solicitud de cross (observación del usuario): los lanzamientos de subagente usaron `[implementer] WI-015 regenerar tipos` en vez de `[<perfil>::<modelo>] · <WI> · <corte en español>` (`harness/roles/leader.md`). Alcance del arreglo aprobado por el usuario en el chat del Sandbox el 2026-10-21.

## Causa (dos factores, verificados)
1. **Bug del script** `.claude/hooks/check-subagent-title.mjs`: solo validaba si la descripción contenía un ID completo `WI-<COMPONENTE>-NNN` (regex `WI-[A-Z]+-\d{3}`). Los títulos con ID abreviado (`WI-013`, `WI-015`) no coincidían y salían con código 0 sin validar. Prueba directa del script: `[implementer] WI-SANDBOX-015 …` → rc=2; `[implementer] WI-015 …` → rc=0.
2. **Hook no activo en la sesión en curso**: un lanzamiento real con título mal formado y ID completo (`[implementer] WI-SANDBOX-015 prueba hook`) NO fue bloqueado. `.claude/settings.json` (con el hook `PreToolUse(Agent)`) lo creó cross en `c110f84` después de que esta sesión arrancara y no se recarga a mitad de sesión. Basta reiniciar la sesión del Sandbox para que lo cargue; no se tocó ninguna configuración.

## Arreglo
El script valida el formato ante **cualquier** mención de WI (`/\bWI-/`), incluidas las abreviadas, que ahora se rechazan con el mensaje existente. Test nuevo `harness/check-subagent-title.test.mjs` (5 casos: válido, ID completo inválido, abreviados, sin mención de WI, entrada no JSON). Los 30 tests del harness pasan (`node --test harness/*.test.mjs`).

## Declaración
Implementación hecha por el leader (script y test del Harness, no código de `app/`, por lo que la regla de delegar a `implementer` no aplica; el implementationAgent es `leader` y la revisión la hace el `reviewer`). Desde ahora todo lanzamiento de subagente usa el formato `[<perfil>::<modelo>] · <WI> · <corte>`.
