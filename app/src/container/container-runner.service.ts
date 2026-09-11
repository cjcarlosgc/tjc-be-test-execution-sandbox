import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Dockerode from 'dockerode';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import {
  resolveContainerLimits,
  type ContainerLimitsConfig,
} from './container-limits.config.js';
import { DOCKER_CLIENT } from './docker-client.provider.js';

export interface ContainerRunResult {
  exitCode: number | null;
  oomKilled: boolean;
  stdout: string;
  stdoutTruncated: boolean;
  stdoutOriginalBytes: number;
  stderr: string;
  stderrTruncated: boolean;
  stderrOriginalBytes: number;
  timedOut: boolean;
  durationMs: number;
}

const DEFAULT_CONTAINER_WORKING_DIR = '/app';
const PNPM_STORE_CONTAINER_PATH = '/pnpm-store';

interface RunContainerOptions {
  executionId: string;
  nameSuffix: string;
  /** Omitido para containers que no necesitan el bind mount del workspace. */
  workspacePath?: string;
  command: string[];
  network: boolean;
  readOnlyWorkspace: boolean;
  timeoutMs: number;
  workingDir: string;
  extraBinds?: string[];
  /** Por defecto `this.limits.user`; solo el bootstrap del store de pnpm lo eleva a `root`. */
  user?: string;
  /**
   * Capacidades a restaurar por encima del `CapDrop: ['ALL']` de base. Solo
   * el bootstrap del store de pnpm la usa (`CHOWN`): con todas las
   * capacidades dropeadas, ni siquiera `root` puede hacer `chown` — falla
   * con `Operation not permitted` aunque el usuario sea root (confirmado
   * contra el Docker Engine real).
   */
  capAdd?: string[];
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
  private pnpmStoreVolumeReady?: Promise<void>;

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
      workingDir: DEFAULT_CONTAINER_WORKING_DIR,
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
   *
   * `--store-dir` apunta a un named volume Docker (lectura-escritura)
   * compartido entre ejecuciones — ver `pnpmStoreVolumeName` en
   * `ContainerLimitsConfig` — para no volver a descargar dependencias ya
   * cacheadas de un run al siguiente. El store es content-addressable y
   * tolera escritura concurrente, así que compartirlo no reintroduce
   * estado acumulado entre repeticiones: el workspace en sí sigue siendo
   * fresco por ejecución.
   */
  /**
   * `maxTimeoutMs`, si se da, acota el timeout configurado sin poder
   * ampliarlo — lo usa `ExecutionPipelineService` para que ninguna etapa
   * exceda el deadline global de la ejecución (timeouts-cleanup).
   */
  /**
   * `workingDir` (ruta absoluta dentro del container, p. ej. `/app` o
   * `/app/mi-proyecto`) es el directorio real del proyecto cuando el
   * snapshot vino envuelto en una única carpeta contenedora de nivel
   * superior — ver `resolveProjectRoot`. El bind mount siempre expone todo
   * `workspacePath` en `/app`; solo cambia el cwd del comando, nunca qué se
   * monta.
   */
  async installDependencies(
    executionId: string,
    workspacePath: string,
    maxTimeoutMs?: number,
    workingDir: string = DEFAULT_CONTAINER_WORKING_DIR,
  ): Promise<ContainerRunResult> {
    await this.ensurePnpmStoreVolumeOwnership();

    const result = await this.run({
      executionId,
      nameSuffix: 'install',
      workspacePath,
      command: [
        'corepack',
        `pnpm@${this.limits.pnpmVersion}`,
        'install',
        '--frozen-lockfile',
        '--store-dir',
        PNPM_STORE_CONTAINER_PATH,
      ],
      network: true,
      readOnlyWorkspace: false,
      timeoutMs: clampTimeout(this.limits.installTimeoutMs, maxTimeoutMs),
      workingDir,
      extraBinds: [
        `${this.limits.pnpmStoreVolumeName}:${PNPM_STORE_CONTAINER_PATH}`,
      ],
    });
    this.logger.log(
      `install dependencies executionId=${executionId} exitCode=${result.exitCode} oomKilled=${result.oomKilled} timedOut=${result.timedOut} durationMs=${result.durationMs}`,
    );
    return result;
  }

  async runTestCommand(
    executionId: string,
    workspacePath: string,
    command: string[],
    maxTimeoutMs?: number,
    workingDir: string = DEFAULT_CONTAINER_WORKING_DIR,
  ): Promise<ContainerRunResult> {
    const result = await this.run({
      executionId,
      nameSuffix: 'test',
      workspacePath,
      command,
      network: false,
      readOnlyWorkspace: false,
      timeoutMs: clampTimeout(this.limits.testTimeoutMs, maxTimeoutMs),
      workingDir,
    });
    this.logger.log(
      `run tests executionId=${executionId} exitCode=${result.exitCode} oomKilled=${result.oomKilled} timedOut=${result.timedOut} durationMs=${result.durationMs}`,
    );
    return result;
  }

  /**
   * Un volumen Docker named nuevo se crea `root:root` (0755): el proceso de
   * instalación, que corre como `this.limits.user` (no root, por diseño),
   * no podría escribir ahí. Este bootstrap corre una única vez por proceso
   * (memoizado) un container efímero *como root* que solo hace `chown` del
   * punto de montaje vacío antes de que exista ningún contenido — nunca
   * ejecuta código del proyecto ni el propio `pnpm install`, que sigue
   * corriendo como `this.limits.user` sin cambios. Una vez el directorio es
   * de ese usuario, todo lo que pnpm cree debajo hereda su ownership, así
   * que no hace falta repetir el chown (ni recursivo) en runs posteriores.
   */
  private async ensurePnpmStoreVolumeOwnership(): Promise<void> {
    if (!this.pnpmStoreVolumeReady) {
      this.pnpmStoreVolumeReady = this.runPnpmStoreVolumeBootstrap().catch(
        (error: unknown) => {
          this.pnpmStoreVolumeReady = undefined;
          throw error;
        },
      );
    }
    return this.pnpmStoreVolumeReady;
  }

  private async runPnpmStoreVolumeBootstrap(): Promise<void> {
    const bootstrapId = `pnpm-store-init-${randomUUID()}`;
    const result = await this.run({
      executionId: bootstrapId,
      nameSuffix: 'bootstrap',
      command: ['chown', this.limits.user, PNPM_STORE_CONTAINER_PATH],
      network: false,
      readOnlyWorkspace: false,
      timeoutMs: this.limits.timeoutMs,
      workingDir: DEFAULT_CONTAINER_WORKING_DIR,
      extraBinds: [
        `${this.limits.pnpmStoreVolumeName}:${PNPM_STORE_CONTAINER_PATH}`,
      ],
      user: 'root',
      capAdd: ['CHOWN'],
    });
    if (result.timedOut || result.exitCode !== 0) {
      throw new Error(
        `pnpm store volume bootstrap failed: exitCode=${result.exitCode} timedOut=${result.timedOut} stderr=${result.stderr}`,
      );
    }
  }

  private async run(options: RunContainerOptions): Promise<ContainerRunResult> {
    await this.ensureImage(this.limits.image);

    const container = await this.docker.createContainer({
      name: `sandbox-${options.executionId}-${options.nameSuffix}`,
      Image: this.limits.image,
      Cmd: options.command,
      WorkingDir: options.workingDir,
      User: options.user ?? this.limits.user,
      Tty: false,
      HostConfig: {
        Binds: [
          ...(options.workspacePath
            ? [
                `${options.workspacePath}:/app${options.readOnlyWorkspace ? ':ro' : ''}`,
              ]
            : []),
          ...(options.extraBinds ?? []),
        ],
        Memory: this.limits.memoryBytes,
        NanoCpus: this.limits.nanoCpus,
        PidsLimit: this.limits.pidsLimit,
        NetworkMode: options.network ? 'bridge' : 'none',
        Privileged: false,
        ReadonlyRootfs: false,
        CapDrop: ['ALL'],
        CapAdd: options.capAdd,
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
      const { exitCode, oomKilled } = timedOut
        ? { exitCode: null, oomKilled: false }
        : await this.readOutcome(container);
      const durationMs = Date.now() - startedAt;

      return { exitCode, oomKilled, timedOut, durationMs, ...logs };
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

  private async readOutcome(
    container: Dockerode.Container,
  ): Promise<{ exitCode: number | null; oomKilled: boolean }> {
    const inspected = await container.inspect();
    return {
      exitCode: inspected.State.ExitCode ?? null,
      oomKilled: inspected.State.OOMKilled === true,
    };
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

/** Nunca amplía el timeout configurado, solo puede acotarlo más. */
function clampTimeout(configuredMs: number, maxMs: number | undefined): number {
  if (maxMs === undefined) {
    return configuredMs;
  }
  return Math.max(0, Math.min(configuredMs, maxMs));
}
