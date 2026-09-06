# object-storage-access — Tareas

- [ ] Definir el puerto interno `ObjectStorageService` sin tipos del proveedor.
- [ ] Implementar el adaptador Supabase Storage con `@supabase/supabase-js`.
- [ ] Mantener credenciales del host separadas del container.
- [ ] Implementar validación, integridad, retries y timeouts acotados.
- [ ] Implementar `StorageObjectRef` y mapeo role→bucket según `INTEROP-1.0`.

## Calidad

- [ ] Agregar/actualizar pruebas.
- [ ] Verificar manejo de errores.
- [ ] Verificar observabilidad mínima.
- [ ] Ejecutar lint/test/build.
- [ ] Registrar evidencia de revisión en `harness/reports/`.
