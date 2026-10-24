Modelo: leader · configurado claude-sonnet-5-5 · atendido unknown · esfuerzo medium

# Vía rápida — WI-SANDBOX-018 (aislar los e2e del app/.env local)

Pedido de cross por decisión del usuario; alcance aprobado por el usuario en el chat del Sandbox el 2026-10-21. No se leyó ni se tocó `app/.env`.

## Causa
`ConfigModule.forRoot(...)` (en `app.module.ts`) se evalúa al **importar** `AppModule`, antes de que cada spec e2e fije su entorno en `beforeAll`. Con un `app/.env` local, su `SANDBOX_SERVICE_TOKEN` (y demás valores) quedan en la configuración validada y pisan lo que el spec fija después: 12 pruebas daban 401 (y 2 de descarga). Sin `.env`, los e2e pasan (15 pasan, 6 omitidos).

## Cambio (solo configuración de pruebas, sin cambio de producto)
- `app/test/support/isolate-env.ts` (nuevo, 6 líneas): `process.chdir` a un directorio temporal vacío, de modo que `ConfigModule` no encuentre `.env`.
- `app/vitest.config.e2e.ts` (+2 líneas): `setupFiles: ['./test/support/isolate-env.ts']`.
Las rutas de fixtures usan `__dirname`, no `process.cwd()`, por lo que el cambio de directorio no las afecta.

## Verificación (con el `app/.env` local presente)
`pnpm test:e2e`: 2 archivos pasan, 1 omitido; 15 pasan, 6 omitidos (el `full-pipeline` se omite por falta de Docker). Antes del cambio, con el mismo `.env`: 12 fallidos. `pnpm test`: 319 pasan, 5 omitidos; `pnpm lint` en verde.

## Declaración
Cambio mínimo hecho por el leader (≤10 líneas en 2 archivos, solo configuración de pruebas, sin lógica de producto). La revisión independiente la hace el `reviewer`.
