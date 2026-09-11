import type { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/config/get-number-config.js';

export interface ContainerLimitsConfig {
  image: string;
  user: string;
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  timeoutMs: number;
  installTimeoutMs: number;
  testTimeoutMs: number;
  maxCapturedOutputBytes: number;
  pnpmVersion: string;
  pnpmStoreVolumeName: string;
}

/**
 * tech-stack.md: la imagen/runtime Node es seleccionable/configurable, nunca
 * una única versión fija global. CPU/RAM/PIDs/timeout son política del
 * Sandbox (resource-limits transversal); el request de Core no las eleva.
 * `pnpmVersion` resuelve `DEC-SBX-002` (APROBADO, solo pnpm): se invoca
 * siempre `corepack pnpm@<pnpmVersion>` en vez de confiar en el campo
 * `packageManager` del proyecto, que en la práctica suele traer rangos
 * (`^9.0.0`) que corepack rechaza por no ser un semver exacto.
 * `pnpmStoreVolumeName` es un named volume Docker (lectura-escritura,
 * compartido entre ejecuciones) montado solo en la etapa de instalación
 * para evitar re-descargar dependencias ya cacheadas de un run al
 * siguiente. El store de pnpm es content-addressable y soporta escritura
 * concurrente entre procesos, así que no compromete el aislamiento por
 * repetición que sí exige un workspace fresco sin estado acumulado — el
 * store de paquetes no es el estado que ese aislamiento protege.
 */
export function resolveContainerLimits(
  configService: ConfigService,
): ContainerLimitsConfig {
  return {
    image: configService.get<string>(
      'SANDBOX_DEFAULT_NODE_IMAGE',
      'node:22-slim',
    ),
    user: configService.get<string>('SANDBOX_CONTAINER_USER', 'node'),
    memoryBytes: getNumberConfig(
      configService,
      'SANDBOX_CONTAINER_MEMORY_BYTES',
      256 * 1024 * 1024,
    ),
    nanoCpus: getNumberConfig(
      configService,
      'SANDBOX_CONTAINER_NANO_CPUS',
      1_000_000_000,
    ),
    pidsLimit: getNumberConfig(configService, 'SANDBOX_CONTAINER_PIDS_LIMIT', 128),
    timeoutMs: getNumberConfig(
      configService,
      'SANDBOX_CONTAINER_TIMEOUT_MS',
      30_000,
    ),
    installTimeoutMs: getNumberConfig(
      configService,
      'SANDBOX_INSTALL_TIMEOUT_MS',
      180_000,
    ),
    testTimeoutMs: getNumberConfig(
      configService,
      'SANDBOX_TEST_TIMEOUT_MS',
      120_000,
    ),
    maxCapturedOutputBytes: getNumberConfig(
      configService,
      'SANDBOX_CONTAINER_MAX_OUTPUT_BYTES',
      64 * 1024,
    ),
    pnpmVersion: configService.get<string>('SANDBOX_PNPM_VERSION', '9'),
    pnpmStoreVolumeName: configService.get<string>(
      'SANDBOX_PNPM_STORE_VOLUME',
      'sandbox-pnpm-store',
    ),
  };
}
