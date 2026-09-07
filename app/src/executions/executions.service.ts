import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { getNumberConfig } from '../common/config/get-number-config.js';
import { AppHttpException } from '../common/http/app-http-exception.js';
import type { CreateSandboxExecutionRequestDto } from './dto/create-execution-request.dto.js';
import type {
  SandboxExecutionAcceptedResponse,
  SandboxExecutionResultResponse,
  SandboxExecutionStatusResponse,
} from './dto/responses.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { computeRequestFingerprint } from './execution-fingerprint.js';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepository,
} from './execution.repository.js';
import {
  isTerminalStatus,
  type ExecutionRecord,
} from './domain/execution-record.js';

const DEFAULT_POLL_AFTER_MS = 2000;

@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly repository: ExecutionRepository,
    private readonly configService: ConfigService,
    private readonly pipeline: ExecutionPipelineService,
  ) {}

  create(
    dto: CreateSandboxExecutionRequestDto,
    idempotencyKey: string,
    correlationId = 'unknown',
  ): SandboxExecutionAcceptedResponse {
    if (idempotencyKey !== dto.requestId) {
      throw new AppHttpException(
        400,
        'IDEMPOTENCY_KEY_MISMATCH',
        'Idempotency-Key header must equal requestId.',
      );
    }

    this.assertRoles(dto);
    this.assertTargetIds(dto);

    const fingerprint = computeRequestFingerprint(dto);
    const existing = this.repository.findByRequestId(dto.requestId);

    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new AppHttpException(
          409,
          'IDEMPOTENCY_CONFLICT',
          'requestId was already used with a different request body.',
        );
      }
      this.logger.log(
        `execution replay executionId=${existing.executionId} requestId=${existing.requestId} testRunId=${existing.testRunId} projectVersionId=${existing.projectVersionId} correlationId=${correlationId}`,
      );
      return this.toAcceptedResponse(existing);
    }

    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      executionId: randomUUID(),
      requestId: dto.requestId,
      testRunId: dto.testRunId,
      projectVersionId: dto.projectVersionId,
      snapshot: dto.snapshot,
      artifacts: dto.artifacts,
      scope: dto.scope,
      targetIds: dto.targetIds,
      runnerHint: dto.runnerHint,
      status: 'PENDING',
      stage: null,
      failureCode: null,
      failureMessage: null,
      result: null,
      requestFingerprint: fingerprint,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(record);
    this.logger.log(
      `execution accepted executionId=${record.executionId} requestId=${record.requestId} testRunId=${record.testRunId} projectVersionId=${record.projectVersionId} correlationId=${correlationId}`,
    );
    void this.pipeline.run(record.executionId);

    return this.toAcceptedResponse(record);
  }

  getStatus(executionId: string): SandboxExecutionStatusResponse {
    const record = this.findOrFail(executionId);
    return {
      executionId: record.executionId,
      requestId: record.requestId,
      projectVersionId: record.projectVersionId,
      status: record.status,
      stage: record.stage,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  getResult(executionId: string): SandboxExecutionResultResponse {
    const record = this.findOrFail(executionId);

    if (!isTerminalStatus(record.status) || !record.result) {
      throw new AppHttpException(
        409,
        'EXECUTION_NOT_FINISHED',
        'Execution has not reached a terminal state yet.',
      );
    }

    if (!record.startedAt || !record.completedAt) {
      throw new AppHttpException(
        409,
        'EXECUTION_NOT_FINISHED',
        'Execution has not reached a terminal state yet.',
      );
    }

    return {
      executionId: record.executionId,
      requestId: record.requestId,
      testRunId: record.testRunId,
      projectVersionId: record.projectVersionId,
      status: record.status,
      facts: record.result.facts,
      failure: record.result.failure,
      stageDurations: record.result.stageDurations,
      appliedArtifactIds: record.result.appliedArtifactIds,
      evidence: record.result.evidence,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }

  private findOrFail(executionId: string): ExecutionRecord {
    const record = this.repository.findById(executionId);
    if (!record) {
      throw new AppHttpException(
        404,
        'EXECUTION_NOT_FOUND',
        `Execution ${executionId} was not found.`,
      );
    }
    return record;
  }

  private assertRoles(dto: CreateSandboxExecutionRequestDto): void {
    if (dto.snapshot.role !== 'PROJECT_SNAPSHOT') {
      throw new AppHttpException(
        400,
        'VALIDATION_ERROR',
        'snapshot.role must be PROJECT_SNAPSHOT.',
      );
    }
    const invalidArtifact = dto.artifacts.find(
      (artifact) => artifact.download.role !== 'GENERATED_ARTIFACT',
    );
    if (invalidArtifact) {
      throw new AppHttpException(
        400,
        'VALIDATION_ERROR',
        `artifacts[].download.role must be GENERATED_ARTIFACT (artifactId=${invalidArtifact.artifactId}).`,
      );
    }
  }

  private assertTargetIds(dto: CreateSandboxExecutionRequestDto): void {
    if (dto.scope === 'TARGET' && dto.targetIds.length === 0) {
      throw new AppHttpException(
        400,
        'VALIDATION_ERROR',
        'scope=TARGET requires at least one targetId.',
      );
    }
  }

  private toAcceptedResponse(
    record: ExecutionRecord,
  ): SandboxExecutionAcceptedResponse {
    return {
      status: 'PENDING',
      pollAfterMs: getNumberConfig(
        this.configService,
        'SANDBOX_POLL_AFTER_MS',
        DEFAULT_POLL_AFTER_MS,
      ),
      executionId: record.executionId,
      requestId: record.requestId,
      projectVersionId: record.projectVersionId,
    };
  }
}
