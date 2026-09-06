# temporary-workspaces — Especificación

**Estado:** aprobado para SDD 1.0 salvo elementos marcados PENDING/PROPOSED.  
**Historias:** capacidad técnica transversal

## Objetivo

Gestionar filesystem efímero seguro.

## Reglas y comportamiento

- Crear un directorio aleatorio exclusivo por `executionId` bajo una raíz configurada y validada; no aceptar una ruta raíz desde el request.
- Normalizar y resolver cada entrada antes de escribir. Rechazar rutas absolutas, `..`, Zip Slip/path traversal, enlaces que escapen y colisiones peligrosas.
- Limitar tamaño comprimido/expandido, cantidad de entradas y tamaño individual; abortar y limpiar ante archivos excesivos o relación de expansión anómala.
- Aplicar permisos mínimos y montar en el container únicamente el workspace necesario, nunca la raíz completa, credenciales ni directorios ajenos del host.
- El workspace es efímero: se elimina al finalizar y un sweeper idempotente recupera residuos por TTL.
- No conservar signed URLs, repositorios ni artefactos como caché permanente.


## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
