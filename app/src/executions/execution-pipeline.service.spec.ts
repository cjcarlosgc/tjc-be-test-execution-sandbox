import { describe, expect, it, vi } from 'vitest';
import type { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import type { RunnerAdapterRegistry } from '../runner-adapters/runner-adapter-registry.js';
import type { ExecutionInputDownloadService } from '../workspace/execution-input-download.service.js';
import type { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import type { WorkspaceManager } from '../workspace/workspace-manager.js';
import {
  InputDownloadFailedError,
  UnsupportedRunnerError,
} from '../common/errors/sandbox-fact-error.js';
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

describe('ExecutionPipelineService', () => {
  function build(options: {
    createWorkspace?: () => Promise<string>;
    downloadToFile?: () => Promise<void>;
    extract?: () => Promise<void>;
    applyArtifacts?: () => Promise<string[]>;
    cleanup?: () => Promise<void>;
    resolveRunner?: () => Promise<unknown>;
  }) {
    const repository = new InMemoryExecutionRepository();

    const workspaceManager = {
      createWorkspace: options.createWorkspace ?? (async () => '/tmp/workspace'),
      cleanup: options.cleanup ?? vi.fn(async () => {}),
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

    const runnerAdapterRegistry = {
      resolve: options.resolveRunner ?? (async () => ({})),
    } as unknown as RunnerAdapterRegistry;

    const pipeline = new ExecutionPipelineService(
      repository,
      workspaceManager,
      archiveExtractor,
      downloadService,
      artifactMaterializer,
      runnerAdapterRegistry,
    );

    return { pipeline, repository, workspaceManager, runnerAdapterRegistry };
  }

  it('moves a PENDING execution to PREPARING and leaves it there on success', async () => {
    const record = baseRecord();
    const { pipeline, repository } = build({});
    repository.save(record);

    await pipeline.run(record.executionId);

    const updated = repository.findById(record.executionId);
    expect(updated?.status).toBe('PREPARING');
    expect(updated?.stage).toBe('PREPARING');
    expect(updated?.startedAt).toBeTruthy();
    expect(updated?.failureCode).toBeNull();
  });

  it('marks the execution FAILED with a SandboxFailureFact when the download is rejected', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = build({
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

  it('classifies an unexpected error as UNKNOWN and still cleans up the workspace', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = build({
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

  it('applies artifacts and records how many were materialized', async () => {
    const record = baseRecord();
    const applyArtifacts = vi.fn(async () => ['a1', 'a2']);
    const { pipeline, repository } = build({ applyArtifacts });
    repository.save(record);

    await pipeline.run(record.executionId);

    expect(applyArtifacts).toHaveBeenCalledWith('/tmp/workspace', []);
    expect(repository.findById(record.executionId)?.status).toBe('PREPARING');
  });

  it('fails with UNSUPPORTED_RUNNER when the runnerHint does not match the project', async () => {
    const record = baseRecord();
    const { pipeline, repository, workspaceManager } = build({
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

  it('is a no-op when the execution no longer exists', async () => {
    const { pipeline } = build({});
    await expect(pipeline.run('does-not-exist')).resolves.toBeUndefined();
  });
});
