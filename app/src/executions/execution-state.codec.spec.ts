import { describe, expect, it } from 'vitest';
import type { ExecutionRecord } from './domain/execution-record.js';
import {
  EXECUTION_STATE_SCHEMA_VERSION,
  PersistedRecordError,
  SANDBOX_RESTARTED_CODE,
  SANDBOX_RESTARTED_MESSAGE,
  deserializeExecutionRecord,
  markInterruptedAsRestarted,
  serializeExecutionRecord,
} from './execution-state.codec.js';

const SIGNED = 'https://storage.example.com/x?X-Signature=SECRETO';

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function completedRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    executionId: uuid(1),
    requestId: uuid(2),
    testRunId: uuid(3),
    projectVersionId: uuid(4),
    snapshot: { role: 'PROJECT_SNAPSHOT', url: SIGNED, expiresAt: '2026-10-18T13:00:00.000Z', sha256: 'a'.repeat(64), sizeBytes: 10 },
    projectRoot: 'packages/api',
    artifacts: [
      {
        artifactId: uuid(5),
        relativePath: 'src/foo.spec.ts',
        artifactType: 'CREATED',
        download: { role: 'GENERATED_ARTIFACT', url: SIGNED, expiresAt: '2026-10-18T13:00:00.000Z', sha256: 'b'.repeat(64), sizeBytes: 5 },
      },
    ],
    scope: 'TARGET',
    targetIds: [uuid(6)],
    executionProfile: 'NODE_TYPESCRIPT',
    runnerHint: 'VITEST',
    phase: 'GENERATED_TESTS',
    status: 'COMPLETED',
    stage: 'FINALIZING',
    failureCode: null,
    failureMessage: null,
    result: {
      facts: {
        runner: 'VITEST',
        passed: 1,
        failed: 0,
        skipped: 0,
        todo: 0,
        totalTests: 1,
        testCases: [],
      } as unknown as NonNullable<ExecutionRecord['result']>['facts'],
      failure: null,
      stageDurations: [{ stage: 'RUNNING_TESTS', durationMs: 12, startedAt: '2026-10-18T12:00:01.000Z' }] as unknown as NonNullable<ExecutionRecord['result']>['stageDurations'],
      appliedArtifactIds: [uuid(5)],
      evidence: [],
    },
    requestFingerprint: 'f'.repeat(64),
    startedAt: '2026-10-18T12:00:00.000Z',
    completedAt: '2026-10-18T12:00:05.000Z',
    createdAt: '2026-10-18T12:00:00.000Z',
    updatedAt: '2026-10-18T12:00:05.000Z',
    ...overrides,
  };
}

const WHITELIST = [
  'schemaVersion', 'executionId', 'requestId', 'testRunId', 'projectVersionId', 'status', 'stage', 'failureCode',
  'failureMessage', 'result', 'requestFingerprint', 'scope', 'targetIds', 'executionProfile', 'runnerHint', 'phase',
  'startedAt', 'completedAt', 'createdAt', 'updatedAt',
];

describe('serializeExecutionRecord (lista blanca)', () => {
  it('escribe exactamente los campos de la lista blanca con schemaVersion 1', () => {
    const persisted = serializeExecutionRecord(completedRecord());
    expect(Object.keys(persisted).sort()).toEqual([...WHITELIST].sort());
    expect(persisted.schemaVersion).toBe(EXECUTION_STATE_SCHEMA_VERSION);
    expect(EXECUTION_STATE_SCHEMA_VERSION).toBe(1);
  });

  it('nunca incluye snapshot, artifacts, projectRoot ni URLs firmadas', () => {
    const json = JSON.stringify(serializeExecutionRecord(completedRecord()));
    expect(json).not.toContain('SECRETO');
    expect(json).not.toContain('https://');
    expect(json).not.toContain('packages/api');
    expect(json).not.toMatch(/"(snapshot|artifacts|projectRoot|download|url|expiresAt)"/);
  });

  it('no comparte la lista de objetivos con el registro original', () => {
    const record = completedRecord();
    const persisted = serializeExecutionRecord(record);
    persisted.targetIds.push('otro');
    expect(record.targetIds).toEqual([uuid(6)]);
  });
});

describe('deserializeExecutionRecord', () => {
  it('reconstruye el registro con valores inertes para lo no persistido', () => {
    const restored = deserializeExecutionRecord(JSON.parse(JSON.stringify(serializeExecutionRecord(completedRecord()))));
    expect(restored.snapshot).toEqual({ role: 'PROJECT_SNAPSHOT', url: '', sha256: '0'.repeat(64), sizeBytes: 0, expiresAt: '2026-10-18T12:00:00.000Z' });
    expect(restored.artifacts).toEqual([]);
    expect(restored.projectRoot).toBe('.');
    expect(restored.status).toBe('COMPLETED');
    expect(restored.result?.appliedArtifactIds).toEqual([uuid(5)]);
  });

  it.each<[string, (raw: Record<string, unknown>) => void]>([
    ['schemaVersion desconocida', (raw) => { raw.schemaVersion = 2; }],
    ['schemaVersion ausente', (raw) => { delete raw.schemaVersion; }],
    ['executionId que no es UUID', (raw) => { raw.executionId = 'abc'; }],
    ['status fuera de enum', (raw) => { raw.status = 'EXPLODED'; }],
    ['fecha inválida', (raw) => { raw.createdAt = 'ayer'; }],
    ['targetIds no es lista de textos', (raw) => { raw.targetIds = [1]; }],
    ['failureCode numérico', (raw) => { raw.failureCode = 500; }],
    ['terminal sin result', (raw) => { raw.result = null; }],
    ['result sin listas de evidencia', (raw) => { raw.result = { facts: null, failure: null, stageDurations: {}, appliedArtifactIds: [], evidence: [] }; }],
  ])('rechaza %s', (_label, mutate) => {
    const raw = JSON.parse(JSON.stringify(serializeExecutionRecord(completedRecord()))) as Record<string, unknown>;
    mutate(raw);
    expect(() => deserializeExecutionRecord(raw)).toThrow(PersistedRecordError);
  });

  it('rechaza algo que no es un objeto', () => {
    expect(() => deserializeExecutionRecord(null)).toThrow(PersistedRecordError);
    expect(() => deserializeExecutionRecord([])).toThrow(PersistedRecordError);
    expect(() => deserializeExecutionRecord('texto')).toThrow(PersistedRecordError);
  });
});

describe('markInterruptedAsRestarted', () => {
  const nowIso = '2026-10-18T13:00:00.000Z';

  it('marca FAILED/SANDBOX_RESTARTED con el contenido de la spec, sin datos del entorno', () => {
    const running = completedRecord({
      status: 'RUNNING_TESTS',
      stage: 'RUNNING_TESTS',
      result: null,
      startedAt: '2026-10-18T12:00:02.000Z',
      completedAt: null,
      updatedAt: '2026-10-18T12:00:03.000Z',
    });
    const marked = markInterruptedAsRestarted(running, nowIso);
    expect(marked.status).toBe('FAILED');
    expect(marked.stage).toBe('RUNNING_TESTS');
    expect(marked.failureCode).toBe(SANDBOX_RESTARTED_CODE);
    expect(marked.failureMessage).toBe(SANDBOX_RESTARTED_MESSAGE);
    expect(marked.startedAt).toBe('2026-10-18T12:00:02.000Z');
    expect(marked.completedAt).toBe(nowIso);
    expect(marked.updatedAt).toBe(nowIso);
    expect(marked.result).toEqual({
      facts: null,
      failure: { stage: 'RUNNING_TESTS', category: 'INFRASTRUCTURE', code: SANDBOX_RESTARTED_CODE, message: SANDBOX_RESTARTED_MESSAGE },
      stageDurations: [],
      appliedArtifactIds: [],
      evidence: [],
    });
  });

  it('usa PREPARING y createdAt cuando nunca arrancó', () => {
    const pending = completedRecord({ status: 'PENDING', stage: null, result: null, startedAt: null, completedAt: null });
    const marked = markInterruptedAsRestarted(pending, nowIso);
    expect(marked.stage).toBe('PREPARING');
    expect(marked.startedAt).toBe(pending.createdAt);
    expect(marked.result?.failure?.stage).toBe('PREPARING');
  });
});
