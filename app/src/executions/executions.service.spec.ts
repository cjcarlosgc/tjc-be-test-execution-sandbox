import { beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ExecutionsService } from './executions.service.js';
import { InMemoryExecutionRepository } from './execution.repository.js';
import type { CreateSandboxExecutionRequestDto } from './dto/create-execution-request.dto.js';

function fakeConfigService(): ConfigService {
  return {
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  } as unknown as ConfigService;
}

function validRequest(
  overrides: Partial<CreateSandboxExecutionRequestDto> = {},
): CreateSandboxExecutionRequestDto {
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
    artifacts: [
      {
        artifactId: '44444444-4444-4444-8444-444444444444',
        relativePath: 'src/foo.spec.ts',
        artifactType: 'CREATED',
        download: {
          role: 'GENERATED_ARTIFACT',
          url: 'https://storage.example.com/artifact.ts?sig=def',
          expiresAt: '2026-09-06T01:00:00.000Z',
          sha256: 'b'.repeat(64),
          sizeBytes: 128,
        },
      },
    ],
    scope: 'TARGET',
    targetIds: ['55555555-5555-4555-8555-555555555555'],
    runnerHint: 'VITEST',
  };
  return { ...base, ...overrides };
}

describe('ExecutionsService', () => {
  let service: ExecutionsService;
  let repository: InMemoryExecutionRepository;

  beforeEach(() => {
    repository = new InMemoryExecutionRepository();
    service = new ExecutionsService(repository, fakeConfigService());
  });

  it('accepts a valid request and returns PENDING with a stable executionId', () => {
    const dto = validRequest();
    const response = service.create(dto, dto.requestId);

    expect(response.status).toBe('PENDING');
    expect(response.requestId).toBe(dto.requestId);
    expect(response.projectVersionId).toBe(dto.projectVersionId);
    expect(response.executionId).toBeTruthy();
  });

  it('rejects when Idempotency-Key does not match requestId', () => {
    const dto = validRequest();
    expect(() => service.create(dto, 'not-the-request-id')).toThrowError(
      /IDEMPOTENCY_KEY_MISMATCH|Idempotency-Key/,
    );
  });

  it('replays the same executionId for an identical retried request', () => {
    const dto = validRequest();
    const first = service.create(dto, dto.requestId);
    const second = service.create(dto, dto.requestId);

    expect(second.executionId).toBe(first.executionId);
  });

  it('is not affected by a re-signed URL or a new expiresAt on retry', () => {
    const dto = validRequest();
    const first = service.create(dto, dto.requestId);

    const resigned = validRequest({
      requestId: dto.requestId,
      snapshot: {
        ...dto.snapshot,
        url: 'https://storage.example.com/snapshot.zip?sig=different',
        expiresAt: '2026-09-06T02:00:00.000Z',
      },
    });
    const second = service.create(resigned, dto.requestId);

    expect(second.executionId).toBe(first.executionId);
  });

  it('rejects reusing requestId with a materially different body', () => {
    const dto = validRequest();
    service.create(dto, dto.requestId);

    const conflicting = validRequest({
      requestId: dto.requestId,
      testRunId: '99999999-9999-4999-8999-999999999999',
    });

    expect(() => service.create(conflicting, dto.requestId)).toThrowError(
      /already used with a different request body/,
    );
  });

  it('rejects snapshot with the wrong role', () => {
    const dto = validRequest({
      snapshot: {
        ...validRequest().snapshot,
        role: 'GENERATED_ARTIFACT',
      },
    });
    expect(() => service.create(dto, dto.requestId)).toThrowError(
      /snapshot\.role/,
    );
  });

  it('rejects an artifact download with the wrong role', () => {
    const base = validRequest();
    const dto = validRequest({
      artifacts: [
        { ...base.artifacts[0], download: { ...base.artifacts[0].download, role: 'PROJECT_SNAPSHOT' } },
      ],
    });
    expect(() => service.create(dto, dto.requestId)).toThrowError(
      /GENERATED_ARTIFACT/,
    );
  });

  it('requires at least one targetId when scope is TARGET', () => {
    const dto = validRequest({ targetIds: [] });
    expect(() => service.create(dto, dto.requestId)).toThrowError(
      /scope=TARGET/,
    );
  });

  it('allows an empty targetIds array when scope is BATCH', () => {
    const dto = validRequest({ scope: 'BATCH', targetIds: [] });
    expect(() => service.create(dto, dto.requestId)).not.toThrow();
  });

  it('throws EXECUTION_NOT_FOUND for an unknown executionId', () => {
    expect(() => service.getStatus('unknown-id')).toThrowError(
      /was not found/,
    );
  });

  it('returns a lightweight PENDING status right after acceptance', () => {
    const dto = validRequest();
    const accepted = service.create(dto, dto.requestId);
    const status = service.getStatus(accepted.executionId);

    expect(status.status).toBe('PENDING');
    expect(status.stage).toBeNull();
    expect(status.completedAt).toBeNull();
  });

  it('rejects reading the result before a terminal state is reached', () => {
    const dto = validRequest();
    const accepted = service.create(dto, dto.requestId);

    expect(() => service.getResult(accepted.executionId)).toThrowError(
      /has not reached a terminal state/,
    );
  });
});
