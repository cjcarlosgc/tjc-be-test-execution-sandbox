import type { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/config/get-number-config.js';
import type { ExecutionProfile } from '../common/contracts/sandbox-execution.contract.js';

export interface ProfileContainerConfig {
  image: string;
  user: string;
}

export interface ContainerLimitsConfig {
  profiles: Record<ExecutionProfile, ProfileContainerConfig>;
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  timeoutMs: number;
  installTimeoutMs: number;
  testTimeoutMs: number;
  maxCapturedOutputBytes: number;
  pnpmVersion: string;
  pnpmStoreVolumeName: string;
  composerCacheVolumeName: string;
}

/**
 * Imagen del profile PHP que el propio Sandbox construye desde
 * `app/docker/php/Dockerfile` si falta en el host (009, corte T-003). Si
 * `SANDBOX_DEFAULT_PHP_IMAGE` apunta a otra imagen, se descarga con pull y
 * debe traer `composer` y `unzip` en el PATH.
 */
export const MANAGED_PHP_IMAGE = 'tjc-sandbox-php:8.3';

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
    profiles: {
      NODE_TYPESCRIPT: {
        image: configService.get<string>(
          'SANDBOX_DEFAULT_NODE_IMAGE',
          'node:22-slim',
        ),
        user: configService.get<string>('SANDBOX_CONTAINER_USER', 'node'),
      },
      /**
       * La imagen gestionada parte de `php:8.3-cli`; es un default
       * configurable, no una versión fija de política (009/system-contract.md:
       * "no se fija una única versión de PHP/Laravel hasta revisar
       * repositorios reales"). El usuario `root` +
       * `COMPOSER_ALLOW_SUPERUSER=1` (container-runner.service.ts) es un
       * placeholder pragmático: la imagen oficial `php` no trae un usuario
       * no-root listo para usar como sí trae `node:*-slim`.
       */
      PHP_LARAVEL_PHPUNIT: {
        image: configService.get<string>(
          'SANDBOX_DEFAULT_PHP_IMAGE',
          MANAGED_PHP_IMAGE,
        ),
        user: configService.get<string>('SANDBOX_PHP_CONTAINER_USER', 'root'),
      },
    },
    memoryBytes: getNumberConfig(
      configService,
      'SANDBOX_CONTAINER_MEMORY_BYTES',
      // 256 MiB no alcanzaba para `composer install`/`pnpm install` de
      // proyectos reales (009, corte T-003).
      1024 * 1024 * 1024,
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
    composerCacheVolumeName: configService.get<string>(
      'SANDBOX_COMPOSER_CACHE_VOLUME',
      'sandbox-composer-cache',
    ),
  };
}
