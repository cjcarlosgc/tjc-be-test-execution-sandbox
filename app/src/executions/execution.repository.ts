import { Injectable } from '@nestjs/common';
import type { ExecutionRecord } from './domain/execution-record.js';

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');

export interface ExecutionRepository {
  findById(executionId: string): ExecutionRecord | null;
  findByRequestId(requestId: string): ExecutionRecord | null;
  save(record: ExecutionRecord): void;
}

@Injectable()
export class InMemoryExecutionRepository implements ExecutionRepository {
  private readonly byExecutionId = new Map<string, ExecutionRecord>();
  private readonly byRequestId = new Map<string, ExecutionRecord>();

  findById(executionId: string): ExecutionRecord | null {
    return this.byExecutionId.get(executionId) ?? null;
  }

  findByRequestId(requestId: string): ExecutionRecord | null {
    return this.byRequestId.get(requestId) ?? null;
  }

  save(record: ExecutionRecord): void {
    this.byExecutionId.set(record.executionId, record);
    this.byRequestId.set(record.requestId, record);
  }
}
