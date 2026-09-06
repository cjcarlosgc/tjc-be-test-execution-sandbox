import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Dockerode from 'dockerode';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { resolveSandboxLimits } from '../common/config/sandbox-limits.config.js';
import { DOCKER_CLIENT } from '../container/docker-client.provider.js';
import type {
  HealthCheckDetail,
  HealthLiveResponse,
  HealthReadyResponse,
} from './health-responses.js';

/**
 * INTEROP-1.1 §7.5: `/health/ready` distingue indisponibilidad de Docker,
 * conectividad de adquisición y capacidad interna, sin ejecutar código del
 * proyecto ni revelar configuración sensible (nunca secretos, tokens u
 * hostnames permitidos completos).
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Dockerode,
    private readonly configService: ConfigService,
  ) {}

  live(): HealthLiveResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async ready(): Promise<HealthReadyResponse> {
    const [docker, downloadPolicy, workspace] = await Promise.all([
      this.checkDocker(),
      this.checkDownloadPolicy(),
      this.checkWorkspace(),
    ]);

    const allOk = [docker, downloadPolicy, workspace].every(
      (check) => check.status === 'ok',
    );

    return {
      status: allOk ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: { docker, downloadPolicy, workspace },
    };
  }

  private async checkDocker(): Promise<HealthCheckDetail> {
    try {
      await this.docker.ping();
      return { status: 'ok', message: null };
    } catch {
      return {
        status: 'unavailable',
        message: 'Docker engine is not reachable',
      };
    }
  }

  private checkDownloadPolicy(): HealthCheckDetail {
    const limits = resolveSandboxLimits(this.configService);
    if (limits.allowedDownloadHosts.length === 0) {
      return {
        status: 'unavailable',
        message: 'no allowed download hosts configured',
      };
    }
    return { status: 'ok', message: null };
  }

  private async checkWorkspace(): Promise<HealthCheckDetail> {
    const limits = resolveSandboxLimits(this.configService);
    try {
      await fs.mkdir(limits.workspaceRoot, { recursive: true });
      await fs.access(limits.workspaceRoot, fsConstants.W_OK);
      return { status: 'ok', message: null };
    } catch {
      return {
        status: 'unavailable',
        message: 'workspace root is not writable',
      };
    }
  }
}
