import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveSandboxLimits } from '../common/config/sandbox-limits.config.js';
import type {
  ExecutionArtifactInput,
  ExecutionEvidenceFact,
  ExecutionPhase,
  ExecutionProfile,
  RunnerFacts,
  SandboxExecutionStatus,
  SandboxFailureFact,
  SandboxStage,
  StageDuration,
} from '../common/contracts/sandbox-execution.contract.js';
import {
  DependencyInstallFailedError,
  InvalidArtifactPathError,
  OomKilledError,
  SandboxFactError,
  SandboxTimeoutError,
  TestCompilationFailedError,
  TestEnvironmentConfigurationError,
  TestExecutionFailedError,
  WorkspaceDiskLimitExceededError,
} from '../common/errors/sandbox-fact-error.js';
import { ContainerRunner } from '../container/container-runner.service.js';
import { assertSupportedManifest } from '../container/package-manager-detection.js';
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
import { getNumberConfig } from '../common/config/get-number-config.js';

/**
 * Tope por defecto de ejecuciones simultáneas. Pensado para la VM de referencia (e2-medium, 2 vCPU / 4 GB) con
 * contenedores de 1 GiB. La espera en cola es una medida diagnóstica, no de calidad; ver spec 008 («Concurrencia»).
 */
export const DEFAULT_MAX_CONCURRENT_EXECUTIONS = 2;

const SNAPSHOT_STAGING_PREFIX = 'sandbox-snapshot-';
const RESULTS_FILENAME = '.sandbox-results.json';
/** El workspace siempre se monta en `/app` dentro del container (container-runner.service.ts). */
const CONTAINER_WORKSPACE_MOUNT = '/app';
const MAX_EVIDENCE_BYTES = 8 * 1024;

/**
 * Duración y marcas ISO de inicio/fin de una etapa (hechos de tiempo; la
 * ventana `[startedAt, completedAt]` es exactamente la que se mide).
 */
function stageTiming(stage: SandboxStage, startedAtMs: number): StageDuration {
  const completedAtMs = Date.now();
  return {
    stage,
    durationMs: completedAtMs - startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
  };
}

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
  private readonly maxConcurrent: number;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

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
    this.maxConcurrent = Math.max(1, Math.floor(getNumberConfig(configService, 'SANDBOX_MAX_CONCURRENT_EXECUTIONS', DEFAULT_MAX_CONCURRENT_EXECUTIONS)));
  }

  /**
   * Ejecuta el pipeline. El controller la dispara sin `await` (`void`)
   * para no bloquear el `202`; los tests pueden esperarla directamente.
   */
  run(executionId: string): Promise<void> {
    return this.withSlot(() =>
      this.execute(executionId).catch((error: unknown) => {
        this.logger.error(
          `unhandled pipeline error for ${executionId}: ${(error as Error).message}`,
        );
      }),
    );
  }

  /** Cuántas ejecuciones corren ahora y cuántas esperan un hueco (para pruebas y diagnóstico). */
  get load(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  /**
   * Limita las ejecuciones simultáneas (`SANDBOX_MAX_CONCURRENT_EXECUTIONS`, por defecto 2): cada una usa un
   * contenedor con CPU y memoria acotadas, y sin tope una ráfaga de peticiones agota la VM. Las que esperan
   * conservan el estado `PENDING`, que es lo que Core ya sabe consultar.
   */
  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
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

      // Core entrega la raíz efectiva ya congelada. Sandbox no detecta ni
      // elige proyectos: solo comprueba que la ruta exista bajo el snapshot
      // y que un symlink no pueda escapar del repositoryRoot.
      const projectRoot = await resolveProjectRoot(
        workspacePath,
        record.projectRoot,
      );
      const containerWorkingDir = this.toContainerWorkingDir(
        workspacePath,
        projectRoot,
      );

      const appliedArtifactIds = await this.artifactMaterializer.applyArtifacts(
        workspacePath,
        record.artifacts,
      );
      // Se valida en PREPARING: un artefacto fuera del proyecto no debe
      // consumir la instalación con red antes de fallar.
      const testPaths = selectTestPaths(
        record.phase,
        record.artifacts,
        workspacePath,
        projectRoot,
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
        record.executionProfile,
        record.runnerHint,
        { workspacePath: projectRoot, resultsFilePath },
      );
      stageDurations.push(stageTiming('PREPARING', preparingStartedAt));

      await assertSupportedManifest(record.executionProfile, projectRoot);

      this.assertWithinDeadline(deadlineAt, 'INSTALLING_DEPENDENCIES');

      currentStage = 'INSTALLING_DEPENDENCIES';
      this.transitionTo(executionId, currentStage);
      const installStartedAt = Date.now();
      const installResult = await this.containerRunner.installDependencies(
        executionId,
        workspacePath,
        record.executionProfile,
        deadlineAt - Date.now(),
        containerWorkingDir,
      );
      stageDurations.push(stageTiming(currentStage, installStartedAt));
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
          `dependency installation failed with exit code ${installResult.exitCode}: ${truncate(
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
        testPaths,
      });
      // Un reporte que ya venía en el snapshot (o de otra etapa) no puede
      // hacerse pasar por el de esta ejecución.
      await fs.rm(hostResultsFilePath, { force: true, recursive: true });
      const testStartedAt = Date.now();
      const testResult = await this.containerRunner.runTestCommand(
        executionId,
        workspacePath,
        command,
        record.executionProfile,
        deadlineAt - Date.now(),
        containerWorkingDir,
      );
      stageDurations.push(stageTiming(currentStage, testStartedAt));
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
      await this.recoverPhpWorkspaceAccess(
        executionId,
        workspacePath,
        record.executionProfile,
      );
      if (testResult.timedOut) {
        throw new SandboxTimeoutError(
          'TEST_TIMEOUT',
          'TEST_RUNTIME',
          'test execution exceeded the configured timeout',
        );
      }

      const rawResults = await fs
        .readFile(hostResultsFilePath, 'utf8')
        .catch(() => null);
      if (rawResults === null || rawResults.trim().length === 0) {
        throw missingReportError(
          record.executionProfile,
          testResult.exitCode,
          testResult.stdout,
          testResult.stderr,
          rawResults === null ? 'missing' : 'empty',
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

      const facts: RunnerFacts = adapter.parseResult(rawResults, containerWorkingDir);

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
        // Failure paths (install error, OOM, timeout) skip the post-test
        // recovery above; repair runner-owned entries before removal.
        await this.recoverPhpWorkspaceAccess(
          executionId,
          workspacePath,
          record.executionProfile,
        );
        await this.workspaceManager.cleanup(workspacePath);
      }
    }
  }

  /**
   * Restores host access to runner-owned PHP workspace entries. Best effort:
   * a recovery failure is observable in the log and must never replace the
   * execution's own outcome (for example `TEST_TIMEOUT`).
   */
  private async recoverPhpWorkspaceAccess(
    executionId: string,
    workspacePath: string,
    executionProfile: string,
  ): Promise<void> {
    if (executionProfile !== 'PHP_LARAVEL_PHPUNIT') {
      return;
    }
    try {
      await this.containerRunner.restorePhpWorkspaceAccess(
        executionId,
        workspacePath,
      );
    } catch (error) {
      this.logger.warn(
        `execution ${executionId} workspace ACL recovery failed: ${(error as Error).message}`,
      );
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
 * `GENERATED_TESTS` con artefactos ejecuta solo esos archivos; el resto
 * (BASELINE o sin artefactos) ejecuta la suite configurada (009, corte
 * T-003). `relativePath` llega relativo a la raíz cruda del workspace y el
 * comando corre en `projectRoot`, así que se re-expresa respecto de este.
 */
export function selectTestPaths(
  phase: ExecutionPhase,
  artifacts: ExecutionArtifactInput[],
  workspacePath: string,
  projectRoot: string,
): string[] {
  if (phase !== 'GENERATED_TESTS' || artifacts.length === 0) {
    return [];
  }
  return artifacts.map((artifact) => {
    const relativeToProject = path.relative(
      projectRoot,
      path.join(workspacePath, artifact.relativePath),
    );
    if (
      relativeToProject.startsWith('..') ||
      path.isAbsolute(relativeToProject)
    ) {
      throw new InvalidArtifactPathError(
        `artifact ${artifact.artifactId} is outside the project root: ${artifact.relativePath}`,
      );
    }
    return relativeToProject.split(path.sep).join('/');
  });
}

/**
 * PHPUnit 11 crea el JUnit vacío (0 bytes) y escribe en stdout "An error
 * occurred inside PHPUnit ... syntax error, unexpected ..." cuando un archivo
 * de test no compila (verificado contra PHPUnit 11.5).
 */
const PHP_SYNTAX_ERROR_PATTERN =
  /syntax error, unexpected|Parse error|\bParseError\b|Unclosed '[[{(]'/;

function missingReportError(
  executionProfile: ExecutionProfile,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  reportState: 'missing' | 'empty',
): Error {
  const configurationCrash = extractFatalConfigurationError(stderr);
  if (configurationCrash) {
    return new TestEnvironmentConfigurationError(configurationCrash);
  }
  const output = `${stdout}\n${stderr}`;
  if (
    executionProfile === 'PHP_LARAVEL_PHPUNIT' &&
    PHP_SYNTAX_ERROR_PATTERN.test(output)
  ) {
    return new TestCompilationFailedError(
      `test files could not be compiled: ${truncate(output.trim(), 500)}`,
    );
  }
  return new TestExecutionFailedError(
    `runner results file is ${reportState} (exitCode=${exitCode}): ${truncate((stderr || stdout).trim(), 500)}`,
  );
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
