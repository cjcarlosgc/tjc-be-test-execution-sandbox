# object-storage-access — Especificación

**Estado:** aprobado para SDD 1.1 salvo elementos marcados PENDING/PROPOSED.
**Historias:** capacidad técnica transversal

## Objetivo

Descargar snapshots exactos sin exponer credenciales al proyecto ejecutado.

## Reglas y comportamiento

- El proveedor de objetos aprobado es Supabase Storage mediante `@supabase/supabase-js`.
- La lógica de aplicación consume exclusivamente una abstracción interna `ObjectStorageService`; no importa tipos ni clientes de Supabase fuera del adaptador de infraestructura.
- El servicio obtiene la `ProjectVersion` inmutable y los artefactos autorizados requeridos por una ejecución; no selecciona otra versión ni usa nombres de archivo como identidad.
- Keys, buckets y credenciales permanecen internos. Las credenciales viven en el host/service Sandbox y nunca se inyectan al container.
- Validar tamaño, integridad y formato antes de extraer el snapshot; aplicar timeout, retries acotados y errores normalizados.
- Core referencia snapshots/artefactos mediante `StorageObjectRef` de `INTEROP-1.0`: role lógico, key opaca, SHA-256 y tamaño. El role se mapea por configuración al bucket real y no expone tipos de Supabase.
- El navegador no accede a Storage a través de este servicio.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
