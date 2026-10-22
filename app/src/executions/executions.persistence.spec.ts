import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSandboxExecutionRequestDto } from './dto/create-execution-request.dto.js';
import type { ExecutionPipelineService } from './execution-pipeline.service.js';
import { FileExecutionRepository } from './file-execution.repository.js';
import { ExecutionsService } from './executions.service.js';
import { AppHttpException } from '../common/http/app-http-exception.js';

function fakeConfigService(): ConfigService {
  return { get: (_key: string, defaultValue?: unknown) => defaultValue } as unknown as ConfigService;
}

function validRequest(overrides: Partial<CreateSandboxExecutionRequestDto> = {}): CreateSandboxExecutionRequestDto {
  const base: CreateSandboxExecutionRequestDto = {
    requestId: '11111111-1111-4111-8111-111111111111',
    testRunId: '22222222-2222-4222-8222-222222222222',
    projectVersionId: '33333333-3333-4333-8333-333333333333',
    snapshot: {
      role: 'PROJECT_SNAPSHOT',
      url: 'https://storage.example.com/snapshot.zip?sig=abc',
      expiresAt: '2026-09-06T01:00:00.000Z',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    },
    artifacts: [],
    scope: 'TARGET',
    targetIds: ['55555555-5555-4555-8555-555555555555'],
    executionProfile: 'NODE_TYPESCRIPT',
    runnerHint: 'VITEST',
  };
  return { ...base, ...overrides };
}

describe('ExecutionsService con estado persistido (reinicio)', () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sbx-exec-persist-'));
    dir = join(root, 'executions');
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  /** Simula un reinicio: un repositorio y un servicio nuevos sobre el mismo directorio. */
  function restart(run: () => Promise<void> = async () => {}) {
    const repository = new FileExecutionRepository(dir);
    repository.onModuleInit();
    const pipeline = { run: vi.fn(run) };
    const service = new ExecutionsService(repository, fakeConfigService(), pipeline as unknown as ExecutionPipelineService);
    return { repository, service, pipeline };
  }

  it('el replay de un requestId persistido devuelve el mismo executionId sin lanzar el pipeline', () => {
    const dto = validRequest();
    const before = restart();
    const first = before.service.create(dto, dto.requestId);
    expect(before.pipeline.run).toHaveBeenCalledTimes(1);

    const after = restart();
    const replay = after.service.create(
      validRequest({ snapshot: { ...dto.snapshot, url: 'https://storage.example.com/snapshot.zip?sig=resigned', expiresAt: '2026-09-06T02:00:00.000Z' } }),
      dto.requestId,
    );

    expect(replay.executionId).toBe(first.executionId);
    expect(replay.status).toBe('PENDING');
    expect(after.pipeline.run).not.toHaveBeenCalled();
  });

  it('el mismo requestId con otra huella responde 409 IDEMPOTENCY_CONFLICT tras reiniciar', () => {
    const dto = validRequest();
    restart().service.create(dto, dto.requestId);

    const after = restart();
    let caught: unknown;
    try {
      after.service.create(validRequest({ testRunId: '99999999-9999-4999-8999-999999999999' }), dto.requestId);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppHttpException);
    expect((caught as AppHttpException).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(after.pipeline.run).not.toHaveBeenCalled();
  });

  it('una ejecución en curso al reiniciar responde 200 en /result con FAILED/SANDBOX_RESTARTED, no 409', () => {
    const dto = validRequest();
    const accepted = restart(() => new Promise<void>(() => {})).service.create(dto, dto.requestId);

    const after = restart();
    const status = after.service.getStatus(accepted.executionId);
    expect(status.status).toBe('FAILED');
    expect(status.failureCode).toBe('SANDBOX_RESTARTED');
    expect(status.startedAt).not.toBeNull();
    expect(status.completedAt).not.toBeNull();

    const result = after.service.getResult(accepted.executionId);
    expect(result.status).toBe('FAILED');
    expect(result.facts).toBeNull();
    expect(result.failure).toEqual({
      stage: 'PREPARING',
      category: 'INFRASTRUCTURE',
      code: 'SANDBOX_RESTARTED',
      message: 'El Sandbox se reinició durante la ejecución.',
    });
    expect(result.stageDurations).toEqual([]);
    expect(result.appliedArtifactIds).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.startedAt).toBe(status.startedAt);
    expect(result.completedAt).toBe(status.completedAt);
  });

  it('una ejecución terminal restaurada responde /result igual que antes del reinicio', () => {
    const dto = validRequest();
    const before = restart();
    const accepted = before.service.create(dto, dto.requestId);
    const { repository } = before;
    const finished = repository.findById(accepted.executionId);
    expect(finished).not.toBeNull();
    repository.save({
      ...finished!,
      status: 'COMPLETED',
      stage: 'FINALIZING',
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: { facts: null, failure: null, stageDurations: [], appliedArtifactIds: [], evidence: [] },
    });
    const beforeRestart = before.service.getResult(accepted.executionId);

    const after = restart();
    expect(after.service.getResult(accepted.executionId)).toEqual(beforeRestart);
  });
});
