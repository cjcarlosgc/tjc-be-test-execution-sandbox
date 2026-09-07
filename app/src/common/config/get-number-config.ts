import type { ConfigService } from '@nestjs/config';

/**
 * `ConfigService.get<number>(key, default)` no convierte en tiempo de
 * ejecución: el genérico `<number>` es solo una anotación de TypeScript. Un
 * valor real de `.env`/proceso siempre llega como string, así que sin esta
 * coerción explícita un límite numérico configurado (memoria, CPU, PIDs,
 * timeouts, bytes) se propaga como string hasta el JSON que dockerode envía
 * al daemon, que lo rechaza (`cannot unmarshal string into Go struct field
 * ...Memory of type int64`). Solo se manifiesta con un `.env` real cargado —
 * las pruebas unitarias usan un `ConfigService` falso que ya devuelve
 * números literales, por lo que nunca lo ejercitaron.
 */
export function getNumberConfig(
  configService: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const raw = configService.get(key);
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
