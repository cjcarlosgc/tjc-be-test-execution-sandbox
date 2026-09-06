import type { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';

export const DOCKER_CLIENT = Symbol('DOCKER_CLIENT');

/**
 * Conecta vía Docker API (dockerode), nunca `docker` CLI (architecture.md).
 * En desarrollo/prevalidación apunta al socket de Docker Desktop; el destino
 * remoto (`DEC-INF-001`, PENDING) se configura por host/puerto sin cambiar
 * este código.
 */
export function dockerClientFactory(configService: ConfigService): Dockerode {
  const host = configService.get<string>('SANDBOX_DOCKER_HOST');
  if (host) {
    return new Dockerode({
      host,
      port: configService.get<number>('SANDBOX_DOCKER_PORT', 2375),
    });
  }

  const socketPath = configService.get<string>('SANDBOX_DOCKER_SOCKET_PATH');
  if (socketPath) {
    return new Dockerode({ socketPath });
  }

  return new Dockerode();
}
