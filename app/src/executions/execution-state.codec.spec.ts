import { describe, expect, it } from 'vitest';
import type { ExecutionRecord } from './domain/execution-record.js';
import {
  EXECUTION_STATE_SCHEMA_VERSION,
  PersistedRecordError,
  SANDBOX_RESTARTED_CODE,
  SANDBOX_RESTARTED_MESSAGE,
  deserializeExecutionRecord,
  markInterruptedAsRestarted,
  redactSensitiveText,
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

describe('redactSensitiveText', () => {
  const SIGNED_URL = 'https://storage.example.com/x/snapshot.zip?X-Signature=SECRETO&X-Amz-Expires=600';
  const WORKSPACE = '/srv/sandbox-workspaces';
  const TMP = '/var/folders/ab/T';

  it('sustituye la URL firmada completa, hasta espacio, comilla o paréntesis', () => {
    expect(redactSensitiveText(`GET ${SIGNED_URL} falló`, [])).toBe('GET [url-redactada] falló');
    expect(redactSensitiveText(`(${SIGNED_URL})`, [])).toBe('([url-redactada])');
    expect(redactSensitiveText(`"${SIGNED_URL}"`, [])).toBe('"[url-redactada]"');
    expect(redactSensitiveText(`fin ${SIGNED_URL}`, [])).toBe('fin [url-redactada]');
  });

  it('sustituye rutas del host, consumiendo el resto del token de la ruta', () => {
    expect(redactSensitiveText(`ENOENT: open '${WORKSPACE}/e1/src/a.ts' y ${TMP}/sandbox-snapshot-1.zip`, [WORKSPACE, TMP]))
      .toBe("ENOENT: open '[ruta-redactada]' y [ruta-redactada]");
    expect(redactSensitiveText(`en ${WORKSPACE}.`, [WORKSPACE])).toBe('en [ruta-redactada].');
  });

  it('no sustituye un nombre distinto que solo empieza igual', () => {
    expect(redactSensitiveText(`${WORKSPACE}-old/x y ${WORKSPACE}2`, [WORKSPACE])).toBe(`${WORKSPACE}-old/x y ${WORKSPACE}2`);
  });

  it('compara rutas de forma literal aunque contengan caracteres de regex', () => {
    expect(redactSensitiveText('/srv/a+b(c)/x ok', ['/srv/a+b(c)'])).toBe('[ruta-redactada] ok');
  });

  it('ignora rutas relativas, vacías y la raíz del sistema', () => {
    const text = 'relativa data/x, vacía y raíz /';
    expect(redactSensitiveText(text, ['', 'data', '/'])).toBe(text);
  });

  it('no toca el texto sin datos sensibles', () => {
    expect(redactSensitiveText('Dos pruebas fallaron (2/9)', [WORKSPACE, TMP])).toBe('Dos pruebas fallaron (2/9)');
  });
});

describe('serializeExecutionRecord redacta el texto libre', () => {
  const SIGNED_URL = 'https://storage.example.com/x/snapshot.zip?X-Signature=SECRETO';
  const WORKSPACE = '/srv/sandbox-workspaces';
  const TMP = '/var/folders/ab/T';
  const HOST_PATHS = [WORKSPACE, TMP];

  it('redacta URL firmada y rutas en failureMessage, failure.message y evidence', () => {
    const record = completedRecord({
      status: 'FAILED',
      failureCode: 'DOWNLOAD_FAILED',
      failureMessage: `Descarga fallida: ${SIGNED_URL}`,
      result: {
        facts: null,
        failure: { stage: 'PREPARING', category: 'INFRASTRUCTURE', code: 'DOWNLOAD_FAILED', message: `ENOENT '${WORKSPACE}/e1/a.zip' desde ${SIGNED_URL}` },
        stageDurations: [],
        appliedArtifactIds: [],
        evidence: [{ kind: 'TEST_STDERR', stage: 'RUNNING_TESTS', content: `error en ${TMP}/sandbox-snapshot-1.zip ${SIGNED_URL}`, truncated: false, originalBytes: null }],
      },
    });
    const persisted = serializeExecutionRecord(record, HOST_PATHS);
    expect(persisted.failureMessage).toBe('Descarga fallida: [url-redactada]');
    expect(persisted.result?.failure).toEqual({
      stage: 'PREPARING',
      category: 'INFRASTRUCTURE',
      code: 'DOWNLOAD_FAILED',
      message: "ENOENT '[ruta-redactada]' desde [url-redactada]",
    });
    expect(persisted.result?.evidence[0]?.content).toBe('error en [ruta-redactada] [url-redactada]');
    const json = JSON.stringify(persisted);
    expect(json).not.toContain('SECRETO');
    expect(json).not.toContain('https://');
    expect(json).not.toContain(WORKSPACE);
    expect(json).not.toContain(TMP);
  });

  it('un registro UNKNOWN cuyo error.message trae ruta absoluta y URL conserva código y categoría y redacta el mensaje', () => {
    const message = `ENOENT: no such file or directory, open '${WORKSPACE}/e2/src/a.ts' (${SIGNED_URL})`;
    const record = completedRecord({
      status: 'FAILED',
      stage: 'RUNNING_TESTS',
      failureCode: 'UNKNOWN',
      failureMessage: message,
      result: {
        facts: null,
        failure: { stage: 'RUNNING_TESTS', category: 'UNKNOWN', code: 'UNKNOWN', message },
        stageDurations: [],
        appliedArtifactIds: [],
        evidence: [],
      },
    });
    const persisted = serializeExecutionRecord(record, HOST_PATHS);
    expect(persisted.failureCode).toBe('UNKNOWN');
    expect(persisted.result?.failure).toEqual({
      stage: 'RUNNING_TESTS',
      category: 'UNKNOWN',
      code: 'UNKNOWN',
      message: "ENOENT: no such file or directory, open '[ruta-redactada]' ([url-redactada])",
    });
    expect(persisted.failureMessage).toBe(persisted.result?.failure?.message);
  });

  it('redacta nombre, suitePath y errorMessage de los casos de prueba', () => {
    const record = completedRecord({
      status: 'FAILED',
      result: {
        facts: {
          runner: 'VITEST',
          passed: 0,
          failed: 1,
          skipped: 0,
          todo: 0,
          totalTests: 1,
          testCases: [
            {
              suitePath: `${WORKSPACE}/e3/src`,
              name: `usa ${SIGNED_URL}`,
              status: 'FAILED',
              durationMs: 1,
              errorMessage: `expected ${TMP}/out.txt`,
              failureKind: 'ASSERTION',
            },
          ],
        } as unknown as NonNullable<ExecutionRecord['result']>['facts'],
        failure: null,
        stageDurations: [],
        appliedArtifactIds: [],
        evidence: [],
      },
    });
    const facts = serializeExecutionRecord(record, HOST_PATHS).result?.facts as unknown as { testCases: Array<Record<string, unknown>> };
    expect(facts.testCases[0]).toEqual({
      suitePath: '[ruta-redactada]',
      name: 'usa [url-redactada]',
      status: 'FAILED',
      durationMs: 1,
      errorMessage: 'expected [ruta-redactada]',
      failureKind: 'ASSERTION',
    });
  });

  it('no altera los campos sin datos sensibles', () => {
    const record = completedRecord({ status: 'FAILED', failureCode: 'TEST_FAILED', failureMessage: 'Dos pruebas fallaron (2/9)' });
    const persisted = serializeExecutionRecord(record, HOST_PATHS);
    expect(persisted.failureMessage).toBe('Dos pruebas fallaron (2/9)');
    expect(persisted.result).toEqual(record.result);
    expect(persisted.failureCode).toBe('TEST_FAILED');
    expect(persisted.executionId).toBe(record.executionId);
    expect(persisted.requestFingerprint).toBe(record.requestFingerprint);
    expect(persisted.createdAt).toBe(record.createdAt);
  });

  it('sin rutas del host solo redacta URLs', () => {
    const record = completedRecord({ status: 'FAILED', failureMessage: `${WORKSPACE}/x ${SIGNED_URL}` });
    expect(serializeExecutionRecord(record).failureMessage).toBe(`${WORKSPACE}/x [url-redactada]`);
  });

  it('no modifica el registro original en memoria', () => {
    const record = completedRecord({ status: 'FAILED', failureMessage: `${SIGNED_URL}` });
    serializeExecutionRecord(record, HOST_PATHS);
    expect(record.failureMessage).toBe(SIGNED_URL);
  });
});
