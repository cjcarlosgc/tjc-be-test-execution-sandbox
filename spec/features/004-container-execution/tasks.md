# 004-container-execution — Tareas

- [x] dockerode client.
- [x] image/runtime selection.
- [x] limits.
- [ ] install/compile/test commands seguros. — bloqueado por `DEC-SBX-002` (PENDING): requiere elegir package manager/lockfiles soportados del proyecto ejecutado antes de construir el comando de instalación. Se implementó en su lugar un "Docker smoke execution" (comando fijo `node --version` del propio Sandbox, sin comandos del proyecto ni de Core) para probar ciclo de vida, límites y aislamiento del container.
- [x] timeout kill.
- [x] remove container.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
