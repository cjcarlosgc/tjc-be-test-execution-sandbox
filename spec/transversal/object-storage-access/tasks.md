# object-storage-access — Tareas

- [ ] Definir el puerto interno `ExecutionInputDownloadService` sin tipos del proveedor.
- [ ] Implementar descarga HTTPS de `EphemeralDownloadRef` según `INTEROP-1.1`.
- [ ] Validar allowlist, expiración, tamaño, SHA-256, redirects, retries y timeouts acotados.
- [ ] Redactar la URL en logs/errores, descartarla después de descargar y mantenerla fuera del container.
- [ ] Verificar que el proyecto Sandbox no dependa de `@supabase/supabase-js` ni requiera credenciales Supabase/DB.

## Calidad

- [ ] Agregar/actualizar pruebas.
- [ ] Verificar manejo de errores.
- [ ] Verificar observabilidad mínima.
- [ ] Ejecutar lint/test/build.
- [ ] Registrar evidencia de revisión en `harness/reports/`.
