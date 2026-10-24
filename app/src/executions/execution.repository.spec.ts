import { describe, expect, it } from 'vitest';
import type { ExecutionRecord } from './domain/execution-record.js';
import { InMemoryExecutionRepository } from './execution.repository.js';

function record(n: number, status: ExecutionRecord['status'], updatedAt: string): ExecutionRecord {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return { executionId: id, requestId: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, status, updatedAt } as ExecutionRecord;
}

describe('InMemoryExecutionRepository: retención acotada', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');

  it('expulsa las ejecuciones terminadas más antiguas al exceder el máximo y conserva las recientes', () => {
    const repo = new InMemoryExecutionRepository({ terminalTtlMs: 3_600_000, maxTerminalRecords: 2 }, () => now);
    for (let i = 1; i <= 4; i += 1) repo.save(record(i, 'COMPLETED', `2026-10-18T11:5${i}:00.000Z`));
    expect(repo.size).toBe(2);
    expect(repo.findById(record(1, 'COMPLETED', '').executionId)).toBeNull();
    expect(repo.findById(record(4, 'COMPLETED', '').executionId)).not.toBeNull();
  });

  it('expulsa por antigüedad aunque no se alcance el máximo', () => {
    const repo = new InMemoryExecutionRepository({ terminalTtlMs: 60_000, maxTerminalRecords: 100 }, () => now);
    repo.save(record(1, 'FAILED', '2026-10-18T10:00:00.000Z'));
    repo.save(record(2, 'FAILED', '2026-10-18T11:59:30.000Z'));
    expect(repo.findById(record(1, 'FAILED', '').executionId)).toBeNull();
    expect(repo.findById(record(2, 'FAILED', '').executionId)).not.toBeNull();
  });

  it('nunca expulsa una ejecución en curso, por vieja que sea', () => {
    const repo = new InMemoryExecutionRepository({ terminalTtlMs: 1, maxTerminalRecords: 0 }, () => now);
    repo.save(record(1, 'RUNNING_TESTS', '2020-01-01T00:00:00.000Z'));
    repo.save(record(2, 'COMPLETED', '2026-10-18T11:00:00.000Z'));
    expect(repo.findById(record(1, 'RUNNING_TESTS', '').executionId)).not.toBeNull();
    expect(repo.findById(record(2, 'COMPLETED', '').executionId)).toBeNull();
  });

  it('al expulsar libera también el índice por requestId', () => {
    const repo = new InMemoryExecutionRepository({ terminalTtlMs: 1, maxTerminalRecords: 0 }, () => now);
    const old = record(1, 'COMPLETED', '2026-10-18T11:00:00.000Z');
    repo.save(old);
    expect(repo.findByRequestId(old.requestId)).toBeNull();
  });
});
