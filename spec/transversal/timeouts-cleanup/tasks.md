# timeouts-cleanup — Tareas

- [x] Timers por etapa y deadline global desde configuración validada. — `SANDBOX_INSTALL_TIMEOUT_MS`/`SANDBOX_TEST_TIMEOUT_MS` por etapa; `SANDBOX_EXECUTION_DEADLINE_MS` es el deadline global y **acota** (nunca amplía) el timeout efectivo de cada etapa (`ContainerRunner` recibe `maxTimeoutMs` desde `ExecutionPipelineService`, `clampTimeout`).
- [x] Kill/remove acotado de procesos y container. — `ContainerRunner.run()`: `container.kill()` al vencer el timeout (de etapa o clamped por el deadline global) y `container.remove({force:true})` siempre en `finally`.
- [x] Cleanup idempotente en `finally` para todos los estados terminales. — `WorkspaceManager.cleanup` (`fs.rm force:true`) se invoca tanto en el camino `COMPLETED` como en el `catch` de `FAILED`/`TIMED_OUT`.
- [x] Recuperación de huérfanos por TTL bajo la raíz controlada. — `WorkspaceManager.sweepExpired()` programado por `WorkspaceSweeperService`.
- [x] Pruebas de timeout y de fallo de cleanup sin ocultar el resultado principal. — timeouts de install/test, timeout de deadline global, y el caso donde `cleanup()` en sí mismo lanza y el resultado `FAILED` ya persistido se conserva intacto.

## Calidad

- [x] Agregar/actualizar pruebas.
- [x] Verificar manejo de errores.
- [x] Verificar observabilidad mínima.
- [x] Ejecutar lint/test/build.
- [x] Registrar evidencia de revisión en `harness/reports/`.
