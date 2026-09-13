# object-storage-access — Especificación de acceso efímero

**Estado:** aprobado para SDD 1.1 salvo elementos marcados PENDING/PROPOSED.
**Historias:** capacidad técnica transversal

## Objetivo

Descargar entradas exactas mediante capacidades temporales sin acoplar Sandbox a Supabase ni exponer secretos al código ejecutado.

## Reglas y comportamiento

- RAG Core es el único componente que conoce Supabase Storage y genera `EphemeralDownloadRef` según `INTEROP-2.0`.
- La aplicación consume un puerto interno `ExecutionInputDownloadService` —nombre orientativo, no proveedor— que descarga HTTPS sin tipos ni SDK de Supabase.
- El host acepta exclusivamente las referencias declaradas y autorizadas de la ejecución, verifica role, expiración, host permitido, tamaño y SHA-256; no selecciona otra versión ni usa nombres de archivo como identidad.
- La URL firmada se considera secreta efímera: no se persiste, no se registra completa, no se reenvía al navegador/container y se descarta al terminar la adquisición.
- Aplicar límite de bytes, timeout, redirects/retries acotados y errores `INPUT_URL_EXPIRED`, `INPUT_DOWNLOAD_FAILED` o `INTEGRITY_CHECK_FAILED`.
- El Sandbox no recibe por defecto `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` ni `DATABASE_PASSWORD`.
- El navegador no accede a Storage a través de este servicio.

## Fuera de alcance

- No ampliar a capacidades no mencionadas en esta spec.
- No convertir decisiones PENDING en implementación definitiva sin aprobación.
