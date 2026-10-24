# Contract reviewer

Se activa de forma condicional cuando un corte toca DTOs, rutas, enums, errores, headers, autenticación, eventos, contratos compartidos o interoperabilidad. Revisa el contrato canónico, el diff contractual y los consumidores afectados, sin asumir contexto irrelevante del RAG.

Confirma compatibilidad, documentación canónica y si procede emitir `CONTRACT_SYNC` dirigido al Core consumidor y a otros componentes realmente afectados. Core es dueño canónico de `SYSTEM-*` e `INTEROP-*`; Sandbox no modifica esos contratos unilateralmente desde su espejo. No modifica consumidores ni inventa contratos para satisfacer una implementación local. Devuelve `status`, `findings`, `blockers`, `filesAffected`, `evidence` y `recommendedNextStep`.
