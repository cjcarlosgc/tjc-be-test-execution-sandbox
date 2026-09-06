import type { ConfigService } from '@nestjs/config';

export interface ContainerLimitsConfig {
  image: string;
  user: string;
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  timeoutMs: number;
  maxCapturedOutputBytes: number;
}

/**
 * tech-stack.md: la imagen/runtime Node es seleccionable/configurable, nunca
 * una única versión fija global. CPU/RAM/PIDs/timeout son política del
 * Sandbox (resource-limits transversal); el request de Core no las eleva.
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
    memoryBytes: configService.get<number>(
      'SANDBOX_CONTAINER_MEMORY_BYTES',
      256 * 1024 * 1024,
    ),
    nanoCpus: configService.get<number>(
      'SANDBOX_CONTAINER_NANO_CPUS',
      1_000_000_000,
    ),
    pidsLimit: configService.get<number>('SANDBOX_CONTAINER_PIDS_LIMIT', 128),
    timeoutMs: configService.get<number>(
      'SANDBOX_CONTAINER_TIMEOUT_MS',
      30_000,
    ),
    maxCapturedOutputBytes: configService.get<number>(
      'SANDBOX_CONTAINER_MAX_OUTPUT_BYTES',
      64 * 1024,
    ),
  };
}
