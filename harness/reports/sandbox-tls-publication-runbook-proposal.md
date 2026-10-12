# Sandbox detrás de TLS — as-built, rate limit, rotación y reversión

Fecha: 2026-10-12. Estado: la publicación TLS **ya está en producción** (reportado por Cross; no verificado por el Sandbox). Este documento fija el as-built y **propone** hardening adicional. **Solo documentación: nada aquí se ejecutó ni toca la VM, el firewall o el código.** Sin secretos en el repo: los valores secretos viven en archivos `0600` de la VM o en el dashboard de Render.

Decisión de Jean (vía Cross): «rate limit sí, rotación de 90 días y IAP respaldo». Valores y alcance ajustados con las respuestas de Cross (verificadas por Cross en el código de Core; el Sandbox no las verificó). Trazabilidad: `Refs: HU11` (misma serie Sandbox/PHP).

## 0. As-built (reportado por Cross)

| Elemento | Valor |
|---|---|
| Proxy | Caddy v2.11.7 en la VM `rag-test-execution-sandbox` |
| Hostname | `136-115-2-208.sslip.io` (IP estática `rag-sandbox-ip`) |
| `/etc/caddy/Caddyfile` | `encode zstd gzip`, `request_body { max_size 5MB }`, `reverse_proxy 127.0.0.1:3001` |
| Certificado | Let's Encrypt por HTTP-01 (80/443 abiertos) |
| Firewall | `rag-sandbox-https-allow` (prio 899, tcp:80,443 desde `0.0.0.0/0`; sin IPs de Render por ser rangos compartidos); 22/3001 solo IAP (900 allow / 901 deny) |
| Respaldo | acceso IAP a 22/3001 se mantiene |

Consecuencia que conviene asumir explícitamente: el borde 443 es **alcanzable desde todo Internet**. La protección es TLS + token Bearer (único, `timingSafeEqual`) + tope de body + (propuesto) rate limit y allowlist de rutas.

Hechos del código relevantes (verificados en este repo): `app.listen(port)` sin host (todas las interfaces, solo `PORT`); sin rate limit ni tope de concurrencia; sin `trust proxy` (un límite en la app vería siempre `127.0.0.1`); un solo `SANDBOX_SERVICE_TOKEN`; `InMemoryExecutionRepository` (reiniciar el proceso pierde ejecuciones en curso y el estado de idempotencia); `/health/ready` sin auth y con detalle de dependencias.

## 1. Rate limit

### Comparación

| Opción | Pros | Contras |
|---|---|---|
| **(a) Caddy + `caddy-ratelimit`** (`github.com/mholt/caddy-ratelimit`) | Mismo proxy; límite por IP real (`{remote_host}`) y por ruta/método; responde `429` con `Retry-After` | Requiere binario personalizado de Caddy (módulo de terceros, cadena de suministro y actualizaciones propias); recarga con reinicio al cambiar binario; compatibilidad con 2.11.7 por verificar |
| (b) nginx `limit_req` | Integrado, sin módulos | Reemplaza a Caddy (TLS/certificados/renovación a reconfigurar); mayor superficie de cambio en producción |
| (c) en la app (`@nestjs/throttler`) | Sin binario externo | Cambio de código + dependencia + despliegue; exige `trust proxy` o verá `127.0.0.1`; ejecuta después del proxy |
| (d) `nftables` sobre conexiones nuevas a 443 | Sin binario ni código | Limita conexiones, no peticiones/ruta; con keep-alive es débil; complemento, no sustituto |

**Recomendación:** (a), por ser el cambio más acotado y granular. Mientras no se pueda recompilar Caddy, (d) como medida provisional. (c) solo si se abre un WI de código.

### Valores (ajustados: un 429 sesgaría métricas)

Core trata un `429` del proxy como `SandboxUnavailable`, lo que haría **fallar repeticiones de experimentos y sesgaría métricas**; además todo el tráfico de Core sale por pocas IP de Render. Por eso el límite es un freno de abuso, no un control de flujo:

- `POST /executions`: **60 req/min por IP**.
- `GET /executions/<id>` y `/result`: **600 req/min por IP**. Base: `pollAfterMs` por defecto es 2000 ms (`SANDBOX_POLL_AFTER_MS`), o sea ~30 GET/min por ejecución activa; 600/min cubre ~20 ejecuciones concurrentes por IP. Core hace polling con el `pollAfterMs` que devuelve el Sandbox, sin intervalo fijo propio.
- `request_body max_size`: **se mantiene 5MB** (no bajar hasta validar con el request real más grande).
- Allowlist de rutas: lo demás `404`. `/health/ready` **no se publica** (Core no lo usa; la verificación se hace por la ruta 401 de `/executions`); `/health/live` sigue disponible.

**Constancia:** si aparece cualquier `429` en la evidencia de experimentos, el límite se sube/ajusta (o se retira) antes de repetir; un `429` en un experimento invalida la repetición afectada como medición.

### Bloque listo para la VM (Caddyfile completo propuesto)

Antes de aplicar, conservar el actual:

```bash
sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-ratelimit
```

Instalar el módulo (sigue la guía de Caddy para binarios personalizados con apt; **verificar la versión del módulo contra 2.11.7**):

```bash
sudo caddy add-package github.com/mholt/caddy-ratelimit
caddy list-modules | grep rate_limit     # debe listar http.handlers.rate_limit
```

Contenido propuesto de `/etc/caddy/Caddyfile`:

```caddyfile
{
	order rate_limit before basicauth
}

136-115-2-208.sslip.io {
	encode zstd gzip

	request_body {
		max_size 5MB
	}

	@allowed {
		path /executions /executions/* /health/live
	}
	handle @allowed {
		rate_limit {
			zone create_per_ip {
				match {
					method POST
					path /executions
				}
				key    {remote_host}
				events 60
				window 1m
			}
			zone read_per_ip {
				match {
					method GET
					path /executions/*
				}
				key    {remote_host}
				events 600
				window 1m
			}
		}
		reverse_proxy 127.0.0.1:3001
	}

	handle {
		respond "not found" 404
	}
}
```

Validar y aplicar:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### Verificación (desde una IP que NO sea la de Core: consume su propia cuota)

```bash
H=136-115-2-208.sslip.io
# 65 POST sin credenciales: sin efecto (401 del guard); esperado: 60 de 401 y luego 429
for i in $(seq 1 65); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://$H/executions; done; echo
# ruta no permitida: 404
curl -s -o /dev/null -w '%{http_code}\n' https://$H/health/ready
# health live sigue disponible: 200
curl -s -o /dev/null -w '%{http_code}\n' https://$H/health/live
```

La IP de prueba queda limitada ~1 minuto; ejecutarla desde una IP que no sea de Core ni de Render para no consumir su cuota.

### Reversión del rate limit

```bash
sudo cp -a /etc/caddy/Caddyfile.pre-ratelimit /etc/caddy/Caddyfile
sudo systemctl reload caddy      # el binario personalizado sigue sirviendo el Caddyfile anterior
# opcional, volver al binario original de apt (según la guía de Caddy: update-alternatives/dpkg-divert)
```

## 2. Rotación del `SANDBOX_SERVICE_TOKEN` cada 90 días

Limitación del código: **un solo token**; no hay solapamiento. La ventana de 401 dura entre el cambio en Render y el reinicio del Sandbox. Además, el reinicio **pierde ejecuciones en curso** (repositorio en memoria): rotar cuando no haya ejecuciones activas. Un doble token (`SANDBOX_SERVICE_TOKEN` + `..._NEXT`) eliminaría la ventana; es un WI de código aparte.

Los comandos asumen un archivo de entorno del proceso (el real puede ser systemd `EnvironmentFile` o el archivo capturado en el runbook de despliegue; adaptar). Ninguno imprime el token ni lo pone en `argv`.

```bash
# 1) Generar el nuevo token en archivo 0600 (no se muestra)
umask 077
openssl rand -hex 32 | tr -d '\n' > ~/sandbox.token.new
# 2) Huella corta para confirmar (compartir solo esto con Cross/Render)
sha256sum ~/sandbox.token.new | cut -c1-8
# 3) Preparar el nuevo archivo de entorno sin el token en argv (printf es builtin)
grep -v '^SANDBOX_SERVICE_TOKEN=' /ruta/al/sandbox.env > ~/sandbox.env.new
printf 'SANDBOX_SERVICE_TOKEN=%s\n' "$(cat ~/sandbox.token.new)" >> ~/sandbox.env.new
```

Ventana mínima (Core actualiza y el Sandbox reinicia en seguida):

1. En Render: establecer `SANDBOX_SERVICE_TOKEN` (mismo valor del archivo; copiarlo por canal seguro, no por chat) y desplegar.
2. En cuanto Render reporte el deploy activo: en la VM, `sudo install -m 0600 ~/sandbox.env.new /ruta/al/sandbox.env`, reiniciar el proceso con el nuevo entorno (mismo cwd/entorno que el runbook de despliegue) — segundos.
3. Verificar sin mostrar el valor (el header va por stdin, no por argv):

```bash
H=136-115-2-208.sslip.io
# nuevo token → 404 en un id inexistente (autenticado), NO 401
printf 'header = "Authorization: Bearer %s"\n' "$(cat ~/sandbox.token.new)" \
  | curl -s -o /dev/null -w '%{http_code}\n' -K - https://$H/executions/00000000-0000-4000-8000-000000000000
# sin credenciales → 401
curl -s -o /dev/null -w '%{http_code}\n' https://$H/executions/00000000-0000-4000-8000-000000000000
```

4. Core confirma por huella sha256 corta (calculada en su entorno) que coincide con la del paso 2.
5. Limpieza: borrar `~/sandbox.token.new` y `~/sandbox.env.new` (con `shred -u` o `unlink`); registrar la fecha y la huella (no el valor); próximo vencimiento +90 días.

Rotación de emergencia (token filtrado): mismo procedimiento sin esperar ventana de inactividad; considerar `systemctl stop caddy` mientras tanto.

## 3. Reversión a IAP-only en 3 comandos

```bash
gcloud compute firewall-rules update rag-sandbox-https-allow --disabled   # (o delete, si se descarta)
sudo systemctl stop caddy
# 3) En el proveedor de Core: SANDBOX_URL → URL del túnel IAP (gcloud compute start-iap-tunnel ... 3001)
```

El Sandbox en `:3001` y el acceso IAP no se tocan. Reactivar: `--no-disabled` y `systemctl start caddy`.

## 4. Riesgos (honestos)

1. 443 abierto a todo Internet con ejecución de código de terceros detrás de un único token: un token filtrado equivale a ejecución arbitraria en la VM. TLS + rate limit mitigan abuso, no sustituyen la postura IAP-only.
2. Sin tope de concurrencia ni cuota en la app: aun con 10 POST/min por IP, varias IPs pueden saturar la VM. Mitigación real: WI de tope de ejecuciones simultáneas.
3. Un binario Caddy personalizado añade una dependencia de terceros que hay que actualizar a mano.
4. Hostname `sslip.io`: servicio gratuito compartido; los límites de Let's Encrypt por dominio registrado pueden afectar emisiones/renovaciones (no verificado).
5. La renovación HTTP-01 depende de mantener el puerto 80 abierto a Let's Encrypt.

## 5. Backlog técnico (sin prioridad, no ahora)

- **Doble token** (`SANDBOX_SERVICE_TOKEN` + `..._NEXT`) para rotar sin ventana de 401. Cambio de código aparte.
- **Tope de concurrencia de ejecuciones.** Requiere un análisis de impacto previo: podría alterar tiempos y, por tanto, métricas de experimentos.

## 6. Decisiones cerradas

1. `/health/ready` no se publica (Core no lo consume).
2. Valores 60/600 por minuto y por IP; `max_size` 5MB; ajuste ante cualquier `429` en evidencia.
3. Doble token y tope de concurrencia: backlog.
4. `Refs: HU11`.
