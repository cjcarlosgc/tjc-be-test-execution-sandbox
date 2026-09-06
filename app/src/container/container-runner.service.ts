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
  stdoutTruncated: boolean;
  stdoutOriginalBytes: number;
  stderr: string;
  stderrTruncated: boolean;
  stderrOriginalBytes: number;
  timedOut: boolean;
  durationMs: number;
}

interface RunContainerOptions {
  executionId: string;
  nameSuffix: string;
  workspacePath: string;
  command: string[];
  network: boolean;
  readOnlyWorkspace: boolean;
  timeoutMs: number;
}

/**
 * Ejecuta comandos fijos y acotados del propio Sandbox dentro de containers
 * efímeros vía dockerode (nunca `docker` CLI, architecture.md). Tres usos:
 * un "Docker smoke execution" (nunca instala/compila/ejecuta nada del
 * proyecto), la instalación de dependencias (`DEC-SBX-002`, APROBADO: solo
 * pnpm, con red acotada a esa etapa) y la ejecución del runner de tests
 * (005-test-runner-adapters, sin red).
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
    const result = await this.run({
      executionId,
      nameSuffix: 'smoke',
      workspacePath,
      command: ['node', '--version'],
      network: false,
      readOnlyWorkspace: true,
      timeoutMs: this.limits.timeoutMs,
    });
    this.logger.log(
      `smoke check executionId=${executionId} image=${this.limits.image} exitCode=${result.exitCode} timedOut=${result.timedOut} durationMs=${result.durationMs}`,
    );
    return result;
  }

  /**
   * `pnpm install --frozen-lockfile` vía `corepack pnpm@<pnpmVersion>`, con
   * red acotada a esta única etapa. No usa el campo `packageManager` del
   * proyecto: en la práctica trae rangos (`^9.0.0`) que corepack rechaza por
   * no ser semver exacto, así que la versión la fija la configuración del
   * Sandbox, no el proyecto ejecutado.
   */
  async installDependencies(
    executionId: string,
    workspacePath: string,
  ): Promise<ContainerRunResult> {
    const result = await this.run({
      executionId,
      nameSuffix: 'install',
      workspacePath,
      command: [
        'corepack',
        `pnpm@${this.limits.pnpmVersion}`,
        'install',
        '--frozen-lockfile',
      ],
      network: true,
      readOnlyWorkspace: false,
      timeoutMs: this.limits.installTimeoutMs,
    });
    this.logger.log(
      `install dependencies executionId=${executionId} exitCode=${result.exitCode} timedOut=${result.timedOut} durationMs=${result.durationMs}`,
    );
    return result;
  }

  async runTestCommand(
    executionId: string,
    workspacePath: string,
    command: string[],
  ): Promise<ContainerRunResult> {
    const result = await this.run({
      executionId,
      nameSuffix: 'test',
      workspacePath,
      command,
      network: false,
      readOnlyWorkspace: false,
      timeoutMs: this.limits.testTimeoutMs,
    });
    this.logger.log(
      `run tests executionId=${executionId} exitCode=${result.exitCode} timedOut=${result.timedOut} durationMs=${result.durationMs}`,
    );
    return result;
  }

  private async run(options: RunContainerOptions): Promise<ContainerRunResult> {
    await this.ensureImage(this.limits.image);

    const container = await this.docker.createContainer({
      name: `sandbox-${options.executionId}-${options.nameSuffix}`,
      Image: this.limits.image,
      Cmd: options.command,
      WorkingDir: '/app',
      User: this.limits.user,
      Tty: false,
      HostConfig: {
        Binds: [
          `${options.workspacePath}:/app${options.readOnlyWorkspace ? ':ro' : ''}`,
        ],
        Memory: this.limits.memoryBytes,
        NanoCpus: this.limits.nanoCpus,
        PidsLimit: this.limits.pidsLimit,
        NetworkMode: options.network ? 'bridge' : 'none',
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
        timeoutHandle = setTimeout(() => resolve('timeout'), options.timeoutMs);
      });

      const outcome = await Promise.race([waitPromise, timeoutPromise]);
      if (outcome === 'timeout') {
        timedOut = true;
        await container.kill().catch(() => undefined);
        await waitPromise.catch(() => undefined);
      }

      const logs = await this.collectLogs(container);
      const exitCode = timedOut ? null : await this.readExitCode(container);
      const durationMs = Date.now() - startedAt;

      return { exitCode, timedOut, durationMs, ...logs };
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

  private async collectLogs(container: Dockerode.Container): Promise<{
    stdout: string;
    stdoutTruncated: boolean;
    stdoutOriginalBytes: number;
    stderr: string;
    stderrTruncated: boolean;
    stderrOriginalBytes: number;
  }> {
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    const limit = this.limits.maxCapturedOutputBytes;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutCollector = new PassThrough();
    const stderrCollector = new PassThrough();
    stdoutCollector.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (Buffer.concat(stdoutChunks).length < limit) {
        stdoutChunks.push(chunk);
      }
    });
    stderrCollector.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (Buffer.concat(stderrChunks).length < limit) {
        stderrChunks.push(chunk);
      }
    });

    this.docker.modem.demuxStream(logStream, stdoutCollector, stderrCollector);

    await new Promise<void>((resolve) => {
      logStream.on('end', resolve);
      logStream.on('close', resolve);
    });

    const stdout = Buffer.concat(stdoutChunks).subarray(0, limit);
    const stderr = Buffer.concat(stderrChunks).subarray(0, limit);

    return {
      stdout: stdout.toString('utf8'),
      stdoutTruncated: stdoutBytes > stdout.length,
      stdoutOriginalBytes: stdoutBytes,
      stderr: stderr.toString('utf8'),
      stderrTruncated: stderrBytes > stderr.length,
      stderrOriginalBytes: stderrBytes,
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
