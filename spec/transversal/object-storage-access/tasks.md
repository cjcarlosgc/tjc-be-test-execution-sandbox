# object-storage-access — Tareas

- [x] Definir el puerto interno `ExecutionInputDownloadService` sin tipos del proveedor.
- [x] Implementar descarga HTTPS de `EphemeralDownloadRef` según `INTEROP-1.6`.
- [x] Validar allowlist, expiración, tamaño, SHA-256, redirects, retries y timeouts acotados.
- [x] Redactar la URL en logs/errores, descartarla después de descargar y mantenerla fuera del container.
- [x] Verificar que el proyecto Sandbox no dependa de `@supabase/supabase-js` ni requiera credenciales Supabase/DB.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
