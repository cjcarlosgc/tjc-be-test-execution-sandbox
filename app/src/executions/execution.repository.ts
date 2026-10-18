import { Injectable } from '@nestjs/common';
import type { ExecutionRecord } from './domain/execution-record.js';
import { isTerminalStatus } from './domain/execution-record.js';

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');

export interface ExecutionRepository {
  findById(executionId: string): ExecutionRecord | null;
  findByRequestId(requestId: string): ExecutionRecord | null;
  save(record: ExecutionRecord): void;
}

export interface ExecutionRetentionPolicy {
  /** Cuánto tiempo (ms) se conserva una ejecución terminada para que Core pueda consultar su resultado. */
  terminalTtlMs: number;
  /** Máximo de ejecuciones terminadas retenidas; al excederlo se expulsan las más antiguas. */
  maxTerminalRecords: number;
}

export const DEFAULT_RETENTION: ExecutionRetentionPolicy = {
  terminalTtlMs: 24 * 60 * 60 * 1000,
  maxTerminalRecords: 500,
};

/**
 * Repositorio en memoria con retención acotada. Las ejecuciones en curso nunca se expulsan; las terminadas se
 * conservan `terminalTtlMs` y como máximo `maxTerminalRecords`, de modo que el proceso no crece sin límite. Tras un
 * reinicio todo se pierde y una consulta de Core responde `404 EXECUTION_NOT_FOUND` (SYSTEM: el Sandbox no persiste).
 */
@Injectable()
export class InMemoryExecutionRepository implements ExecutionRepository {
  private readonly byExecutionId = new Map<string, ExecutionRecord>();
  private readonly byRequestId = new Map<string, ExecutionRecord>();

  constructor(
    private readonly policy: ExecutionRetentionPolicy = DEFAULT_RETENTION,
    private readonly now: () => number = Date.now,
  ) {}

  findById(executionId: string): ExecutionRecord | null {
    return this.byExecutionId.get(executionId) ?? null;
  }

  findByRequestId(requestId: string): ExecutionRecord | null {
    return this.byRequestId.get(requestId) ?? null;
  }

  save(record: ExecutionRecord): void {
    this.byExecutionId.set(record.executionId, record);
    this.byRequestId.set(record.requestId, record);
    if (isTerminalStatus(record.status)) this.evict();
  }

  get size(): number {
    return this.byExecutionId.size;
  }

  private evict(): void {
    const cutoff = this.now() - this.policy.terminalTtlMs;
    const terminal = [...this.byExecutionId.values()]
      .filter((record) => isTerminalStatus(record.status))
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    const overflow = Math.max(0, terminal.length - this.policy.maxTerminalRecords);
    terminal.forEach((record, index) => {
      const expired = Date.parse(record.updatedAt) < cutoff;
      if (expired || index < overflow) this.remove(record);
    });
  }

  private remove(record: ExecutionRecord): void {
    this.byExecutionId.delete(record.executionId);
    if (this.byRequestId.get(record.requestId) === record) this.byRequestId.delete(record.requestId);
  }
}
