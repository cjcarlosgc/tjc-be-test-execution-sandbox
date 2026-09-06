# 004-container-execution — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU23

## Objetivo

Ejecutar instalación, compilación y tests dentro de un container aislado y acotado.

## Reglas y comportamiento

- Crear container por executionId.
- CPU, RAM, almacenamiento temporal, procesos, output y timeout configurables.
- Montar solo workspace requerido.
- No privileged, no Docker socket, user no-root cuando imagen/proyecto lo permitan.
- Capturar exit codes por etapa.
- Destruir container al terminar o expirar.
- Solo ejecutar proyectos TypeScript (`.ts`/`.tsx`) con Jest o Vitest en V1; JavaScript puro es incompatible.
- La política de detección e instalación del package manager del proyecto permanece PENDING en `DEC-SBX-002` y bloquea esa etapa, no el resto del Sandbox.
- CPU, memoria, output y deadline son políticas del Sandbox; el request de Core no puede elevarlas ni suministrar comandos arbitrarios.
- La adquisición e instalación de dependencias pueden usar red bajo política acotada; compilación y tests no tienen red cuando sea viable. El proyecto nunca recibe credenciales o URLs firmadas.
- En desarrollo/prevalidación, Docker Engine corresponde a la VM Linux de Docker Desktop en la MacBook encendida. El mismo contrato debe poder trasladarse a la VM Linux remota cuando se resuelva `DEC-INF-001`.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
