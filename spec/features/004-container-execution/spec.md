# 004-container-execution — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** HU08, HU09, HU10, HU11, HU12, HU14, HU19, HU24. HU23 está descartada.

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
- `DEC-SBX-002` (APROBADO): V1 solo soporta `pnpm`, detectado por `pnpm-lock.yaml` en el snapshot; sin ese lockfile se rechaza como `UNSUPPORTED_PACKAGE_MANAGER`. La instalación se invoca vía `corepack pnpm@<versión fijada por configuración>` (nunca el campo `packageManager` del proyecto), nunca comandos arbitrarios de Core.
- CPU, memoria, output y deadline son políticas del Sandbox; el request de Core no puede elevarlas ni suministrar comandos arbitrarios.
- La adquisición e instalación de dependencias pueden usar red bajo política acotada; compilación y tests no tienen red cuando sea viable. El proyecto nunca recibe credenciales o URLs firmadas.
- En desarrollo/prevalidación de Sprint 2-4, Docker Engine corresponde a la VM Linux de Docker Desktop en la MacBook encendida. El mismo contrato debe poder trasladarse a la VM Linux remota cuando se resuelva `DEC-INF-001` después de Sprint 4; no seleccionar ni sustituir silenciosamente el proveedor remoto.
- Un retry manual de HU24 se ejecuta como una solicitud neutral independiente; el Sandbox no conoce intentos previos, no corrige pruebas y no implementa ciclos de autorreparación.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
