import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Dockerode from 'dockerode';
import { PassThrough } from 'node:stream';
import {
  resolveContainerLimits,
  type ContainerLimitsConfig,
} from './container-limits.config.js';
import { DOCKER_CLIENT } from './docker-client.provider.js';

export interface ContainerRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Ejecuta un comando fijo y acotado del propio Sandbox (nunca uno provisto
 * por Core ni derivado del proyecto) dentro de un container efímero para
 * probar que el motor Docker acepta, aísla y limpia ejecuciones — el
 * "Docker smoke execution" de Sprint 1 (roadmap). No instala dependencias,
 * compila ni ejecuta tests del proyecto: esa etapa depende de `DEC-SBX-002`
 * (PENDING) y de 005-test-runner-adapters, todavía no implementados.
 */
@Injectable()
export class ContainerRunner {
  private readonly logger = new Logger(ContainerRunner.name);
  private readonly limits: ContainerLimitsConfig;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Dockerode,
    configService: ConfigService,
  ) {
    this.limits = resolveContainerLimits(configService);
  }

  async runSmokeCheck(
    executionId: string,
    workspacePath: string,
  ): Promise<ContainerRunResult> {
    await this.ensureImage(this.limits.image);

    const container = await this.docker.createContainer({
      name: `sandbox-${executionId}`,
      Image: this.limits.image,
      Cmd: ['node', '--version'],
      WorkingDir: '/app',
      User: this.limits.user,
      Tty: false,
      HostConfig: {
        Binds: [`${workspacePath}:/app:ro`],
        Memory: this.limits.memoryBytes,
        NanoCpus: this.limits.nanoCpus,
        PidsLimit: this.limits.pidsLimit,
        NetworkMode: 'none',
        Privileged: false,
        ReadonlyRootfs: false,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        AutoRemove: false,
      },
    });

    const startedAt = Date.now();
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      await container.start();

      const waitPromise = container.wait();
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve('timeout'),
          this.limits.timeoutMs,
        );
      });

      const outcome = await Promise.race([waitPromise, timeoutPromise]);
      if (outcome === 'timeout') {
        timedOut = true;
        await container.kill().catch(() => undefined);
        await waitPromise.catch(() => undefined);
      }

      const { stdout, stderr } = await this.collectLogs(container);
      const exitCode = timedOut ? null : await this.readExitCode(container);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `smoke check executionId=${executionId} image=${this.limits.image} exitCode=${exitCode} timedOut=${timedOut} durationMs=${durationMs}`,
      );

      return { exitCode, stdout, stderr, timedOut, durationMs };
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      await container.remove({ force: true }).catch((error: unknown) => {
        this.logger.warn(
          `failed to remove container ${container.id}: ${(error as Error).message}`,
        );
      });
    }
  }

  private async readExitCode(
    container: Dockerode.Container,
  ): Promise<number | null> {
    const inspected = await container.inspect();
    return inspected.State.ExitCode ?? null;
  }

  private async collectLogs(
    container: Dockerode.Container,
  ): Promise<{ stdout: string; stderr: string }> {
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutCollector = new PassThrough();
    const stderrCollector = new PassThrough();
    stdoutCollector.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    stderrCollector.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    this.docker.modem.demuxStream(logStream, stdoutCollector, stderrCollector);

    await new Promise<void>((resolve) => {
      logStream.on('end', resolve);
      logStream.on('close', resolve);
    });

    const limit = this.limits.maxCapturedOutputBytes;
    return {
      stdout: Buffer.concat(stdoutChunks).subarray(0, limit).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).subarray(0, limit).toString('utf8'),
    };
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      // no está en caché local: se descarga a continuación.
    }

    const stream = await this.docker.pull(image, {});
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (progressError: Error | null) => {
          if (progressError) {
            reject(progressError);
          } else {
            resolve();
          }
        },
      );
    });
  }
}
