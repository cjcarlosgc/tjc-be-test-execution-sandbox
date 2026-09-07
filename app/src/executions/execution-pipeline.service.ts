import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
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
  TestExecutionFailedError,
  UnsupportedPackageManagerError,
} from '../common/errors/sandbox-fact-error.js';
import { ContainerRunner } from '../container/container-runner.service.js';
import { hasPnpmLockfile } from '../container/package-manager-detection.js';
import { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import { RunnerAdapterRegistry } from '../runner-adapters/runner-adapter-registry.js';
import {
  EXECUTION_INPUT_DOWNLOAD_SERVICE,
  type ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import type { ExecutionRecord } from './domain/execution-record.js';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepository,
} from './execution.repository.js';

const SNAPSHOT_STAGING_FILENAME = '__snapshot__.zip';
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
    this.executionDeadlineMs = resolveSandboxLimits(configService).executionDeadlineMs;
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
      const snapshotZipPath = path.join(
        workspacePath,
        SNAPSHOT_STAGING_FILENAME,
      );
      await this.downloadService.downloadToFile(
        record.snapshot,
        snapshotZipPath,
      );
      await this.archiveExtractor.extract(snapshotZipPath, workspacePath);
      await fs.rm(snapshotZipPath, { force: true });

      const appliedArtifactIds = await this.artifactMaterializer.applyArtifacts(
        workspacePath,
        record.artifacts,
      );

      // `resultsFilePath` es la ruta que verá el comando dentro del
      // container (workspace montado en `/app`); para leer el archivo desde
      // el host se usa `hostResultsFilePath`, la misma ruta pero en disco.
      const resultsFilePath = path.posix.join(
        CONTAINER_WORKSPACE_MOUNT,
        RESULTS_FILENAME,
      );
      const hostResultsFilePath = path.join(workspacePath, RESULTS_FILENAME);
      const adapter = await this.runnerAdapterRegistry.resolve(
        record.runnerHint,
        { workspacePath, resultsFilePath },
      );
      stageDurations.push({
        stage: 'PREPARING',
        durationMs: Date.now() - preparingStartedAt,
      });

      if (!(await hasPnpmLockfile(workspacePath))) {
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

      this.assertWithinDeadline(deadlineAt, 'RUNNING_TESTS');

      currentStage = 'RUNNING_TESTS';
      this.transitionTo(executionId, currentStage);
      const command = adapter.buildCommand({ workspacePath, resultsFilePath });
      const testStartedAt = Date.now();
      const testResult = await this.containerRunner.runTestCommand(
        executionId,
        workspacePath,
        command,
        deadlineAt - Date.now(),
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
