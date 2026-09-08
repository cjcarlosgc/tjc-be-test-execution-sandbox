import type { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZipFile } from 'yazl';
import type { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import type { RunnerAdapterRegistry } from '../runner-adapters/runner-adapter-registry.js';
import { parseJestCompatibleJson } from '../runner-adapters/jest-compatible-result-parser.js';
import type { TestRunnerAdapter } from '../runner-adapters/test-runner-adapter.js';
import type {
  ContainerRunner,
  ContainerRunResult,
} from '../container/container-runner.service.js';
import type {
  DownloadedFile,
  ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import {
  InputDownloadFailedError,
  UnsupportedRunnerError,
} from '../common/errors/sandbox-fact-error.js';
import type { EphemeralDownloadRef } from '../common/contracts/sandbox-execution.contract.js';
import type { ExecutionRecord } from './domain/execution-record.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { InMemoryExecutionRepository } from './execution.repository.js';

function baseRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  const now = new Date().toISOString();
  return {
    executionId: '11111111-1111-4111-8111-111111111111',
    requestId: '22222222-2222-4222-8222-222222222222',
    testRunId: '33333333-3333-4333-8333-333333333333',
    projectVersionId: '44444444-4444-4444-8444-444444444444',
    snapshot: {
      role: 'PROJECT_SNAPSHOT',
      url: 'https://storage.example.com/s.zip',
      expiresAt: '2099-01-01T00:00:00.000Z',
      sha256: 'a'.repeat(64),
      sizeBytes: 10,
    },
    artifacts: [],
    scope: 'BATCH',
    targetIds: [],
    runnerHint: 'VITEST',
    status: 'PENDING',
    stage: null,
    failureCode: null,
    failureMessage: null,
    result: null,
    requestFingerprint: 'fp',
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function okContainerResult(
  overrides: Partial<ContainerRunResult> = {},
): ContainerRunResult {
  return {
    exitCode: 0,
    oomKilled: false,
    stdout: '',
    stdoutTruncated: false,
    stdoutOriginalBytes: 0,
    stderr: '',
    stderrTruncated: false,
    stderrOriginalBytes: 0,
    timedOut: false,
    durationMs: 1,
    ...overrides,
  };
}

const PASSING_REPORT = JSON.stringify({
  success: true,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [
    {
      name: 'src/math.test.ts',
      status: 'passed',
      assertionResults: [
        { title: 'works', status: 'passed', duration: 1, failureMessages: [] },
      ],
    },
  ],
});

function buildZip(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    for (const [entryPath, content] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(content, 'utf8'), entryPath);
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('ExecutionPipelineService', () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  async function build(options: {
    withPnpmLockfile?: boolean;
    downloadToFile?: (
      ref: EphemeralDownloadRef,
      destinationPath: string,
    ) => Promise<DownloadedFile>;
    extract?: (zipPath: string, destinationRoot: string) => Promise<void>;
    applyArtifacts?: () => Promise<string[]>;
    cleanup?: () => Promise<void>;
    resolveRunner?: () => Promise<unknown>;
    installDependencies?: (workspacePath: string) => Promise<ContainerRunResult>;
    runTestCommand?: (resultsFilePath: string) => Promise<ContainerRunResult>;
    configOverrides?: Record<string, unknown>;
  }) {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pipeline-test-'),
    );
    createdDirs.push(workspaceDir);
    if (options.withPnpmLockfile !== false) {
      await fs.writeFile(
        path.join(workspaceDir, 'pnpm-lock.yaml'),
        "lockfileVersion: '9.0'\n",
      );
    }

    const repository = new InMemoryExecutionRepository();

    // Reutiliza el cálculo real de tamaño de directorio; solo se fakean
    // createWorkspace/cleanup para no depender de la raíz configurada real.
    const realWorkspaceManager = new WorkspaceManager(
      fakeConfigService({ SANDBOX_WORKSPACE_ROOT: workspaceDir }),
    );
    const workspaceManager = {
      createWorkspace: async () => workspaceDir,
      cleanup: options.cleanup ?? vi.fn(async () => {}),
      calculateDirectorySize: (dirPath: string) =>
        realWorkspaceManager.calculateDirectorySize(dirPath),
    } as unknown as WorkspaceManager;

    const downloadService = {
      downloadToFile:
        options.downloadToFile ??
        (async () => ({ path: 'x', sizeBytes: 1, sha256: 'x' })),
    } as unknown as ExecutionInputDownloadService;

    const archiveExtractor = {
      extract: options.extract ?? (async () => {}),
    } as unknown as SafeArchiveExtractor;

    const artifactMaterializer = {
      applyArtifacts: options.applyArtifacts ?? (async () => []),
    } as unknown as ArtifactMaterializer;

    const fakeAdapter: TestRunnerAdapter = {
      runner: 'VITEST',
      supports: async () => true,
      buildCommand: (context) => [
        'node_modules/.bin/vitest',
        'run',
        '--reporter=json',
        `--outputFile=${context.resultsFilePath}`,
      ],
      parseResult: (raw) => parseJestCompatibleJson('VITEST', raw),
    };

    const runnerAdapterRegistry = {
      resolve: options.resolveRunner ?? (async () => fakeAdapter),
    } as unknown as RunnerAdapterRegistry;

    // Simula lo que hace un container real: el comando escribe en la ruta
    // montada (`/app/...`), que en disco corresponde a `workspaceDir` (el
    // mismo bind mount); el fake escribe directo en la ruta del host.
    const hostResultsFilePath = path.join(workspaceDir, '.sandbox-results.json');
    const containerRunner = {
      installDependencies: (_executionId: string, wp: string) =>
        (options.installDependencies ?? (async () => okContainerResult()))(wp),
      runTestCommand: () =>
        options.runTestCommand?.(hostResultsFilePath) ??
        fs
          .writeFile(hostResultsFilePath, PASSING_REPORT, 'utf8')
          .then(() => okContainerResult()),
    } as unknown as ContainerRunner;

    const pipeline = new ExecutionPipelineService(
      repository,
      workspaceManager,
      archiveExtractor,
      downloadService,
      artifactMaterializer,
      runnerAdapterRegistry,
      containerRunner,
      fakeConfigService(options.configOverrides ?? {}),
    );

    return { pipeline, repository, workspaceManager, workspaceDir, containerRunner };
  }

  it('completes an execution end to end and stores RunnerFacts', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({});
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('COMPLETED');
    expect(updated?.stage).toBe('FINALIZING');
    expect(updated?.completedAt).toBeTruthy();
    expect(updated?.result?.facts?.passed).toBe(true);
    expect(updated?.result?.facts?.totalTests).toBe(1);
    expect(updated?.result?.failure).toBeNull();
    expect(
      updated?.result?.stageDurations.map((d) => d.stage),
    ).toEqual(['PREPARING', 'INSTALLING_DEPENDENCIES', 'RUNNING_TESTS']);
    expect(updated?.result?.evidence.map((e) => e.kind)).toEqual([
      'TEST_STDOUT',
      'TEST_STDERR',
      'RUNNER_REPORT',
    ]);
  });

  it('marks the execution FAILED with a SandboxFailureFact when the download is rejected', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = await build({
      downloadToFile: async () => {
        throw new InputDownloadFailedError('host not allowed', 'CONFIGURATION');
      },
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('INPUT_DOWNLOAD_FAILED');
    expect(updated?.completedAt).toBeTruthy();
    expect(updated?.result?.failure).toEqual({
      stage: 'PREPARING',
      category: 'CONFIGURATION',
      code: 'INPUT_DOWNLOAD_FAILED',
      message: 'host not allowed',
    });
    expect(workspaceManager.cleanup).toHaveBeenCalled();
  });

  it('keeps the persisted FAILED result even if cleanup itself fails (timeouts-cleanup)', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      downloadToFile: async () => {
        throw new InputDownloadFailedError('host not allowed', 'CONFIGURATION');
      },
      cleanup: async () => {
        throw new Error('cleanup blew up');
      },
    });
    repository.save(record);

    // El error de cleanup no debe propagarse como un rechazo sin manejar.
    await expect(pipeline.run(record.executionId)).resolves.toBeUndefined();

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('INPUT_DOWNLOAD_FAILED');
  });

  it('classifies an unexpected error as UNKNOWN and still cleans up the workspace', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = await build({
      extract: async () => {
        throw new Error('disk exploded');
      },
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.result?.failure?.category).toBe('UNKNOWN');
    expect(updated?.result?.failure?.message).toBe('disk exploded');
    expect(workspaceManager.cleanup).toHaveBeenCalled();
  });

  it('applies artifacts before checking the package manager and running the pipeline', async () => {
    const record = baseRecord();
    const applyArtifacts = vi.fn(async () => ['a1', 'a2']);
    const { pipeline, repository } = await build({ applyArtifacts });
    repository.save(record);

    await pipeline.run(record.executionId);

    expect(applyArtifacts).toHaveBeenCalledTimes(1);
    expect(repository.findById(record.executionId)?.result?.appliedArtifactIds).toEqual([
      'a1',
      'a2',
    ]);
  });

  it('fails with UNSUPPORTED_RUNNER when the runnerHint does not match the project', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = await build({
      resolveRunner: async () => {
        throw new UnsupportedRunnerError('project does not declare VITEST');
      },
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('UNSUPPORTED_RUNNER');
    expect(updated?.result?.failure?.category).toBe('CONFIGURATION');
    expect(workspaceManager.cleanup).toHaveBeenCalled();
  });

  it('fails with UNSUPPORTED_PACKAGE_MANAGER when there is no pnpm-lock.yaml (DEC-SBX-002)', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({ withPnpmLockfile: false });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('UNSUPPORTED_PACKAGE_MANAGER');
    expect(updated?.result?.failure?.stage).toBe('PREPARING');
  });

  it('finds pnpm-lock.yaml through a real download+extract even when the snapshot is wrapped in a single top-level folder', async () => {
    // Regresión: el ZIP de staging solía descargarse dentro del propio
    // workspacePath, de modo que cuando el proyecto real venía envuelto en
    // una única carpeta contenedora, SafeArchiveExtractor veía DOS entradas
    // de nivel superior (el ZIP + la carpeta) y nunca aplanaba. El fix
    // descarga el ZIP a un staging fuera del workspace (`os.tmpdir()`); esta
    // prueba ejercita el download real (que escribe en la ruta que le pasa
    // el pipeline, no una fija) + el `SafeArchiveExtractor` real juntos,
    // exactamente la combinación donde vivía el bug.
    const record = baseRecord();
    const wrappedZip = await buildZip({
      'my-project/package.json': '{"name":"demo"}',
      'my-project/pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    });
    const observedDownloadPaths: string[] = [];
    const realExtractor = new SafeArchiveExtractor(fakeConfigService());

    const { pipeline, repository, workspaceDir } = await build({
      withPnpmLockfile: false,
      downloadToFile: async (_ref, destinationPath) => {
        observedDownloadPaths.push(destinationPath);
        await fs.writeFile(destinationPath, wrappedZip);
        return { path: destinationPath, sizeBytes: wrappedZip.length, sha256: 'x' };
      },
      extract: (zipPath, destinationRoot) =>
        realExtractor.extract(zipPath, destinationRoot),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('COMPLETED');
    expect(observedDownloadPaths).toHaveLength(1);
    expect(observedDownloadPaths[0]!.startsWith(workspaceDir)).toBe(false);
    expect(
      await fs.readFile(path.join(workspaceDir, 'package.json'), 'utf8'),
    ).toBe('{"name":"demo"}');
  });

  it('fails with DEPENDENCY category when pnpm install exits non-zero', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      installDependencies: async () =>
        okContainerResult({ exitCode: 1, stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('DEPENDENCY_INSTALL_FAILED');
    expect(updated?.result?.failure?.category).toBe('DEPENDENCY');
    expect(updated?.result?.failure?.stage).toBe('INSTALLING_DEPENDENCIES');
  });

  it('reports TIMED_OUT (not FAILED) when dependency installation times out', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      installDependencies: async () => okContainerResult({ timedOut: true, exitCode: null }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('TIMED_OUT');
    expect(updated?.failureCode).toBe('INSTALL_TIMEOUT');
    expect(updated?.result?.failure?.stage).toBe('INSTALLING_DEPENDENCIES');
  });

  it('reports TIMED_OUT when the test run times out', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      runTestCommand: async () => okContainerResult({ timedOut: true, exitCode: null }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('TIMED_OUT');
    expect(updated?.failureCode).toBe('TEST_TIMEOUT');
    expect(updated?.result?.failure?.stage).toBe('RUNNING_TESTS');
  });

  it('reports OOM_KILLED/INFRASTRUCTURE when dependency installation is OOM-killed', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      installDependencies: async () => okContainerResult({ oomKilled: true, exitCode: 137 }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('OOM_KILLED');
    expect(updated?.result?.failure?.category).toBe('INFRASTRUCTURE');
    expect(updated?.result?.failure?.stage).toBe('INSTALLING_DEPENDENCIES');
  });

  it('reports OOM_KILLED/INFRASTRUCTURE when the test run is OOM-killed', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      runTestCommand: async () => okContainerResult({ oomKilled: true, exitCode: 137 }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('OOM_KILLED');
    expect(updated?.result?.failure?.category).toBe('INFRASTRUCTURE');
    expect(updated?.result?.failure?.stage).toBe('RUNNING_TESTS');
  });

  it('fails with WORKSPACE_DISK_LIMIT_EXCEEDED when the workspace grows past the configured limit after install', async () => {
    const record = baseRecord();
    const runTestCommand = vi.fn(async () => okContainerResult());
    const { pipeline, repository } = await build({
      configOverrides: { SANDBOX_MAX_WORKSPACE_BYTES: 1024 },
      installDependencies: async (workspacePath) => {
        // Simula que `pnpm install` escribió un node_modules grande.
        await fs.writeFile(path.join(workspacePath, 'big.bin'), Buffer.alloc(2048));
        return okContainerResult();
      },
      runTestCommand,
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('WORKSPACE_DISK_LIMIT_EXCEEDED');
    expect(updated?.result?.failure?.category).toBe('INFRASTRUCTURE');
    expect(updated?.result?.failure?.stage).toBe('INSTALLING_DEPENDENCIES');
    // Nunca llega a correr tests: el guard corta justo después de instalar.
    expect(runTestCommand).not.toHaveBeenCalled();
  });

  it('reports TIMED_OUT/EXECUTION_DEADLINE_EXCEEDED when the global deadline is already spent after PREPARING', async () => {
    const record = baseRecord();
    const installDependencies = vi.fn(async () => okContainerResult());
    const { pipeline, repository } = await build({
      installDependencies,
      configOverrides: { SANDBOX_EXECUTION_DEADLINE_MS: 0 },
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('TIMED_OUT');
    expect(updated?.failureCode).toBe('EXECUTION_DEADLINE_EXCEEDED');
    expect(updated?.result?.failure?.category).toBe('INFRASTRUCTURE');
    // Nunca llega a instalar: el deadline ya estaba agotado.
    expect(installDependencies).not.toHaveBeenCalled();
  });

  it('fails with TEST_EXECUTION_FAILED when the runner produced no results file', async () => {
    const record = baseRecord();
    const { pipeline, repository } = await build({
      runTestCommand: async () => okContainerResult({ exitCode: 1 }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureCode).toBe('TEST_EXECUTION_FAILED');
    expect(updated?.result?.failure?.stage).toBe('RUNNING_TESTS');
  });

  it('completes with facts.passed=false when tests ran but some failed (not a Sandbox failure)', async () => {
    const record = baseRecord();
    const failingReport = JSON.stringify({
      success: false,
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [
        {
          name: 'src/math.test.ts',
          status: 'failed',
          assertionResults: [
            { title: 'a', status: 'passed', duration: 1, failureMessages: [] },
            { title: 'b', status: 'failed', duration: 1, failureMessages: ['boom'] },
          ],
        },
      ],
    });
    const { pipeline, repository } = await build({
      runTestCommand: async (resultsFilePath) => {
        await fs.writeFile(resultsFilePath, failingReport, 'utf8');
        return okContainerResult({ exitCode: 1 });
      },
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('COMPLETED');
    expect(updated?.result?.facts?.passed).toBe(false);
    expect(updated?.result?.facts?.failedTests).toBe(1);
    expect(updated?.result?.failure).toBeNull();
  });

  it('propagates a DependencyInstallFailedError message truncated from stderr', async () => {
    const record = baseRecord();
    const longStderr = 'x'.repeat(2000);
    const { pipeline, repository } = await build({
      installDependencies: async () =>
        okContainerResult({ exitCode: 1, stderr: longStderr }),
    });
    repository.save(record);

    await pipeline.run(record.executionId);

    const failure = repository.findById(record.executionId)?.result?.failure;
    expect(failure?.code).toBe('DEPENDENCY_INSTALL_FAILED');
    expect(failure?.message).toBeTruthy();
    expect(failure!.message.length).toBeLessThan(longStderr.length);
  });

  it('is a no-op when the execution no longer exists', async () => {
    const { pipeline } = await build({});
    await expect(pipeline.run('does-not-exist')).resolves.toBeUndefined();
  });
});
