import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveSandboxLimits } from '../common/config/sandbox-limits.config.js';
import type {
  ExecutionEvidenceFact,
  RunnerFacts,
  SandboxExecutionStatus,
  SandboxFailureFact,
  SandboxStage,
  StageDuration,
} from '../common/contracts/sandbox-execution.contract.js';
import {
  DependencyInstallFailedError,
  OomKilledError,
  SandboxFactError,
  SandboxTimeoutError,
  TestEnvironmentConfigurationError,
  TestExecutionFailedError,
  UnsupportedPackageManagerError,
  WorkspaceDiskLimitExceededError,
} from '../common/errors/sandbox-fact-error.js';
import { ContainerRunner } from '../container/container-runner.service.js';
import { hasPnpmLockfile } from '../container/package-manager-detection.js';
import { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import { RunnerAdapterRegistry } from '../runner-adapters/runner-adapter-registry.js';
import {
  EXECUTION_INPUT_DOWNLOAD_SERVICE,
  type ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { resolveProjectRoot } from '../workspace/project-root-resolver.js';
import { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import type { ExecutionRecord } from './domain/execution-record.js';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepository,
} from './execution.repository.js';

const SNAPSHOT_STAGING_PREFIX = 'sandbox-snapshot-';
const RESULTS_FILENAME = '.sandbox-results.json';
/** El workspace siempre se monta en `/app` dentro del container (container-runner.service.ts). */
const CONTAINER_WORKSPACE_MOUNT = '/app';
const MAX_EVIDENCE_BYTES = 8 * 1024;

/**
 * Orquesta el pipeline completo: `PREPARING` (002/003) →
 * `INSTALLING_DEPENDENCIES` (004, `DEC-SBX-002` APROBADO: solo pnpm) →
 * `RUNNING_TESTS` (005) → `COMPLETED`/`FAILED`/`TIMED_OUT`. Nunca calcula
 * `valid`/`FailureType`: solo hechos (interoperability-contract §7.3).
 */
@Injectable()
export class ExecutionPipelineService {
  private readonly logger = new Logger(ExecutionPipelineService.name);
  private readonly executionDeadlineMs: number;
  private readonly maxWorkspaceBytes: number;

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly repository: ExecutionRepository,
    private readonly workspaceManager: WorkspaceManager,
    private readonly archiveExtractor: SafeArchiveExtractor,
    @Inject(EXECUTION_INPUT_DOWNLOAD_SERVICE)
    private readonly downloadService: ExecutionInputDownloadService,
    private readonly artifactMaterializer: ArtifactMaterializer,
    private readonly runnerAdapterRegistry: RunnerAdapterRegistry,
    private readonly containerRunner: ContainerRunner,
    configService: ConfigService,
  ) {
    const limits = resolveSandboxLimits(configService);
    this.executionDeadlineMs = limits.executionDeadlineMs;
    this.maxWorkspaceBytes = limits.maxWorkspaceBytes;
  }

  /**
   * Ejecuta el pipeline. El controller la dispara sin `await` (`void`)
   * para no bloquear el `202`; los tests pueden esperarla directamente.
   */
  run(executionId: string): Promise<void> {
    return this.execute(executionId).catch((error: unknown) => {
      this.logger.error(
        `unhandled pipeline error for ${executionId}: ${(error as Error).message}`,
      );
    });
  }

  private async execute(executionId: string): Promise<void> {
    const record = this.repository.findById(executionId);
    if (!record) {
      return;
    }

    const startedAt = record.startedAt ?? new Date().toISOString();
    this.transitionTo(executionId, 'PREPARING', { startedAt });
    // Deadline global de la ejecución (timeouts-cleanup): ninguna etapa
    // individual puede, sumada a las anteriores, exceder este presupuesto.
    const deadlineAt = Date.now() + this.executionDeadlineMs;

    let workspacePath: string | undefined;
    let currentStage: SandboxStage = 'PREPARING';
    const stageDurations: StageDuration[] = [];
    const evidence: ExecutionEvidenceFact[] = [];

    try {
      const preparingStartedAt = Date.now();
      workspacePath = await this.workspaceManager.createWorkspace(executionId);
      // El ZIP se descarga fuera de workspacePath (nunca dentro): si
      // conviviera con el contenido extraído, SafeArchiveExtractor lo
      // contaría como una segunda entrada de nivel superior y nunca
      // detectaría/aplanaría una única carpeta contenedora real del
      // proyecto. `os.tmpdir()` es un scratch por ejecución (nombrado por
      // executionId, único), no el workspace persistente/limpiable del
      // request.
      const snapshotZipPath = path.join(
        os.tmpdir(),
        `${SNAPSHOT_STAGING_PREFIX}${executionId}.zip`,
      );
      try {
        await this.downloadService.downloadToFile(
          record.snapshot,
          snapshotZipPath,
        );
        await this.archiveExtractor.extract(snapshotZipPath, workspacePath);
      } finally {
        await fs.rm(snapshotZipPath, { force: true });
      }

      // `projectRoot` es una detección de solo lectura (nunca mueve/renombra
      // nada en disco): si el snapshot vino envuelto en una única carpeta
      // contenedora de nivel superior, resuelve a esa carpeta; si no, es el
      // propio `workspacePath`. Un aplanado físico desalinearía
      // `artifact.relativePath` — Core lo sigue enviando relativo a la
      // estructura original, envoltorio incluido — así que
      // `applyArtifacts` se resuelve siempre contra `workspacePath` en
      // crudo, nunca contra `projectRoot`.
      const projectRoot = await resolveProjectRoot(workspacePath);
      const containerWorkingDir = this.toContainerWorkingDir(
        workspacePath,
        projectRoot,
      );

      const appliedArtifactIds = await this.artifactMaterializer.applyArtifacts(
        workspacePath,
        record.artifacts,
      );

      // `resultsFilePath` es una ruta absoluta dentro del container (el
      // workspace montado en `/app`); al ser absoluta, el runner la escribe
      // ahí sin importar el working directory del comando. Para leerla
      // desde el host se usa `hostResultsFilePath`, la misma ruta pero en
      // disco.
      const resultsFilePath = path.posix.join(
        CONTAINER_WORKSPACE_MOUNT,
        RESULTS_FILENAME,
      );
      const hostResultsFilePath = path.join(workspacePath, RESULTS_FILENAME);
      const adapter = await this.runnerAdapterRegistry.resolve(
        record.runnerHint,
        { workspacePath: projectRoot, resultsFilePath },
      );
      stageDurations.push({
        stage: 'PREPARING',
        durationMs: Date.now() - preparingStartedAt,
      });

      if (!(await hasPnpmLockfile(projectRoot))) {
        throw new UnsupportedPackageManagerError(
          'project does not declare a pnpm-lock.yaml (V1 only supports pnpm, DEC-SBX-002)',
        );
      }

      this.assertWithinDeadline(deadlineAt, 'INSTALLING_DEPENDENCIES');

      currentStage = 'INSTALLING_DEPENDENCIES';
      this.transitionTo(executionId, currentStage);
      const installStartedAt = Date.now();
      const installResult = await this.containerRunner.installDependencies(
        executionId,
        workspacePath,
        deadlineAt - Date.now(),
        containerWorkingDir,
      );
      stageDurations.push({
        stage: currentStage,
        durationMs: Date.now() - installStartedAt,
      });
      if (installResult.oomKilled) {
        throw new OomKilledError(
          'dependency installation was killed for exceeding the memory limit',
        );
      }
      if (installResult.timedOut) {
        throw new SandboxTimeoutError(
          'INSTALL_TIMEOUT',
          'DEPENDENCY',
          'dependency installation exceeded the configured timeout',
        );
      }
      if (installResult.exitCode !== 0) {
        throw new DependencyInstallFailedError(
          `pnpm install failed with exit code ${installResult.exitCode}: ${truncate(
            installResult.stderr || installResult.stdout,
            500,
          )}`,
        );
      }

      const workspaceBytes =
        await this.workspaceManager.calculateDirectorySize(workspacePath);
      if (workspaceBytes > this.maxWorkspaceBytes) {
        throw new WorkspaceDiskLimitExceededError(
          `workspace grew to ${workspaceBytes} bytes after installing dependencies, exceeding the ${this.maxWorkspaceBytes} byte limit`,
        );
      }

      this.assertWithinDeadline(deadlineAt, 'RUNNING_TESTS');

      currentStage = 'RUNNING_TESTS';
      this.transitionTo(executionId, currentStage);
      const command = adapter.buildCommand({
        workspacePath: projectRoot,
        resultsFilePath,
      });
      const testStartedAt = Date.now();
      const testResult = await this.containerRunner.runTestCommand(
        executionId,
        workspacePath,
        command,
        deadlineAt - Date.now(),
        containerWorkingDir,
      );
      stageDurations.push({
        stage: currentStage,
        durationMs: Date.now() - testStartedAt,
      });
      if (testResult.oomKilled) {
        throw new OomKilledError(
          'test execution was killed for exceeding the memory limit',
        );
      }
      evidence.push(
        {
          kind: 'TEST_STDOUT',
          stage: currentStage,
          content: testResult.stdout,
          truncated: testResult.stdoutTruncated,
          originalBytes: testResult.stdoutTruncated
            ? testResult.stdoutOriginalBytes
            : null,
        },
        {
          kind: 'TEST_STDERR',
          stage: currentStage,
          content: testResult.stderr,
          truncated: testResult.stderrTruncated,
          originalBytes: testResult.stderrTruncated
            ? testResult.stderrOriginalBytes
            : null,
        },
      );
      if (testResult.timedOut) {
        throw new SandboxTimeoutError(
          'TEST_TIMEOUT',
          'TEST_RUNTIME',
          'test execution exceeded the configured timeout',
        );
      }

      let rawResults: string;
      try {
        rawResults = await fs.readFile(hostResultsFilePath, 'utf8');
      } catch (error) {
        const configurationCrash = extractFatalConfigurationError(
          testResult.stderr,
        );
        if (configurationCrash) {
          throw new TestEnvironmentConfigurationError(configurationCrash);
        }
        throw new TestExecutionFailedError(
          `runner did not produce a results file (exitCode=${testResult.exitCode}): ${(error as Error).message}`,
        );
      }
      const { truncated: reportTruncated, originalBytes: reportBytes } =
        truncationInfo(rawResults, MAX_EVIDENCE_BYTES);
      evidence.push({
        kind: 'RUNNER_REPORT',
        stage: currentStage,
        content: truncate(rawResults, MAX_EVIDENCE_BYTES),
        truncated: reportTruncated,
        originalBytes: reportTruncated ? reportBytes : null,
      });

      const facts: RunnerFacts = adapter.parseResult(rawResults);

      currentStage = 'FINALIZING';
      const now = new Date().toISOString();
      this.repository.save({
        ...this.mustFind(executionId),
        status: 'COMPLETED',
        stage: currentStage,
        completedAt: now,
        updatedAt: now,
        result: {
          facts,
          failure: null,
          stageDurations,
          appliedArtifactIds,
          evidence,
        },
      });
      this.logger.log(
        `execution ${executionId} COMPLETED runner=${facts.runner} passed=${facts.passed} totalTests=${facts.totalTests}`,
      );
      await this.workspaceManager.cleanup(workspacePath);
    } catch (error) {
      const isTimeout = error instanceof SandboxTimeoutError;
      const failure = this.toFailureFact(error, currentStage);
      const status: SandboxExecutionStatus = isTimeout ? 'TIMED_OUT' : 'FAILED';
      const now = new Date().toISOString();
      this.repository.save({
        ...this.mustFind(executionId),
        status,
        failureCode: failure.code,
        failureMessage: failure.message,
        completedAt: now,
        updatedAt: now,
        result: {
          facts: null,
          failure,
          stageDurations,
          appliedArtifactIds: [],
          evidence,
        },
      });
      this.logger.warn(
        `execution ${executionId} ${status} during ${currentStage}: ${failure.code} ${failure.message}`,
      );
      if (workspacePath) {
        await this.workspaceManager.cleanup(workspacePath);
      }
    }
  }

  /**
   * Traduce `projectRoot` (ruta absoluta en el host, igual a `workspacePath`
   * o un subdirectorio directo suyo) al working directory equivalente
   * dentro del container, donde todo `workspacePath` está montado en
   * `/app`. El mount nunca cambia — solo el cwd del comando.
   */
  private toContainerWorkingDir(
    workspacePath: string,
    projectRoot: string,
  ): string {
    const relativeDir = path.relative(workspacePath, projectRoot);
    return relativeDir === ''
      ? CONTAINER_WORKSPACE_MOUNT
      : path.posix.join(CONTAINER_WORKSPACE_MOUNT, relativeDir);
  }

  /** Corta antes de iniciar una etapa si ya no queda presupuesto del deadline global. */
  private assertWithinDeadline(deadlineAt: number, nextStage: SandboxStage): void {
    if (Date.now() >= deadlineAt) {
      throw new SandboxTimeoutError(
        'EXECUTION_DEADLINE_EXCEEDED',
        'INFRASTRUCTURE',
        `execution exceeded its global deadline before starting ${nextStage}`,
      );
    }
  }

  private transitionTo(
    executionId: string,
    stage: SandboxStage,
    extra: Partial<ExecutionRecord> = {},
  ): void {
    const record = this.repository.findById(executionId);
    if (!record) {
      return;
    }
    this.repository.save({
      ...record,
      status: stage,
      stage,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
  }

  private mustFind(executionId: string): ExecutionRecord {
    const record = this.repository.findById(executionId);
    if (!record) {
      throw new Error(`execution ${executionId} disappeared during pipeline run`);
    }
    return record;
  }

  private toFailureFact(
    error: unknown,
    stage: SandboxStage,
  ): SandboxFailureFact {
    if (error instanceof SandboxFactError) {
      return {
        stage,
        category: error.category,
        code: error.code,
        message: error.message,
      };
    }
    return {
      stage,
      category: 'UNKNOWN',
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

/**
 * `jest-validate` (Jest CLI) siempre abre sus errores fatales de
 * configuración con este preámbulo fijo, antes de que corra ningún test
 * (p.ej. `testEnvironment: jsdom` sin `jest-environment-jsdom` instalado
 * tras Jest 28 — el pitfall más común de esa migración). Un proyecto real
 * puede desencadenarlo con cualquier test, incluso uno vacío; no es un
 * fallo del test generado, así que se distingue de un `TEST_RUNTIME`
 * genérico devolviendo el mensaje real capturado en TEST_STDERR.
 */
const FATAL_CONFIGURATION_ERROR_MARKER = 'Validation Error:';

function extractFatalConfigurationError(stderr: string): string | null {
  const markerIndex = stderr.indexOf(FATAL_CONFIGURATION_ERROR_MARKER);
  if (markerIndex === -1) {
    return null;
  }
  return truncate(stderr.slice(markerIndex).trim(), MAX_EVIDENCE_BYTES);
}

function truncate(content: string, maxBytes: number): string {
  const buffer = Buffer.from(content, 'utf8');
  if (buffer.length <= maxBytes) {
    return content;
  }
  return buffer.subarray(0, maxBytes).toString('utf8');
}

function truncationInfo(
  content: string,
  maxBytes: number,
): { truncated: boolean; originalBytes: number } {
  const originalBytes = Buffer.byteLength(content, 'utf8');
  return { truncated: originalBytes > maxBytes, originalBytes };
}
