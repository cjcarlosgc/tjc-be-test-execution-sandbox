# WI-SANDBOX-003 — preflight de Contract Sync para VM remota

Fecha: 2026-10-12  
Historia: HU47  
Evento: `CS-CORE-20261012-001`  
Revisión fuente: `76053463e1b073364861d417bc9c2217dccd11a2`

## Aplicación local

Se recibe la decisión operativa de reutilizar la VM existente como único destino
remoto previsto. Se conserva `sddVersion: 2.1`, `SYSTEM-2.2`, el ID del evento y
`sourceStatus: C-PENDING`. No se modifica ningún contrato ni se declara
homologación global.

## Gate de próxima corrida remota

El usuario informó un clon y primer despliegue previos a los fixes, pero no se
aportó ni se verificó el SHA actualmente desplegado en la VM. No se deduce desde
la rama ni desde el checkout local. Por tanto:

- una nueva corrida remota permanece bloqueada hasta obtener el SHA por una
  comprobación de solo lectura;
- no se crea ni aprovisiona VM, no se modifica firewall y no se despliega;
- `DEC-INF-001` continúa `PENDING` y bloquea aprovisionamiento remoto;
- `DEC-VAL-001` aplicará si la futura operación usa código o evidencia
  empresarial.

Un piloto controlado con repositorios propios no queda bloqueado por
`DEC-VAL-001`; esa condición no convierte el ACK local en autorización para una
corrida remota sin SHA verificado.

El acuse local del evento es `ACKNOWLEDGED`, no `RESOLVED`: solo confirma la
aplicación de esta planificación y no resuelve el cambio contractual fuente.

## Addendum de coordinación Cross — 2026-10-12

Cross reportó como verificada evidencia operativa de la VM existente
`rag-test-execution-sandbox`: acceso IAP-only, API IAP habilitada, tag exclusivo,
allow IAP (`35.235.240.0/20`) a TCP 22/3001 con prioridad 900 y deny IPv4
TCP/UDP/ICMP con prioridad 901, prevaleciendo sobre defaults. El intento SSH por
IAP alcanzó el reto OS Login 2FA pendiente de aprobación y la prueba IAP TCP
3001 no conectó con un backend; por tanto no se infiere servicio disponible ni
SHA desplegado.

Esta evidencia operativa no sustituye una actualización canónica del contrato:
el inbox conserva `sourceStatus: C-PENDING` y SYSTEM-2.2 conserva
`DEC-INF-001` como `PENDING`. No se registra esta decisión como aprobada ni se
autoriza VM, firewall, despliegue o corrida remota.

## Evidencia read-only de checkout — 2026-10-12

La comprobación read-only posterior verificó que el checkout clonado en la VM
está en `11f5d9e60fa7941a2a00c69aaf950873d91833b3`, ancestro directo y un
commit detrás de `origin/feature/jean`
`1139abc131a9037d74f68c83d02ee94fd964feeb` (`feat(sandbox): execute PHP from
project root`). No hubo pull, deploy ni modificación remota.

Docker está activo, pero no hay contenedores en ejecución ni detenidos, no hay
listener en el puerto 3001 y las imágenes locales no exponen una etiqueta OCI de
revisión. Por ello se conoce el SHA del checkout, pero **no** se verifica un SHA
de servicio desplegado ni se habilita E2E remoto. El siguiente gate sigue siendo
una autorización separada para desplegar/arrancar, seguida de verificación del
SHA y del servicio efectivo; `DEC-INF-001` mantiene el estado canónico descrito
arriba.
