/**
 * Formato en disco del estado de una ejecución (WI-SANDBOX-010, spec 008 «Persistencia del estado de ejecuciones»).
 *
 * Funciones puras: `serializeExecutionRecord` aplica una LISTA BLANCA campo a campo y nunca copia `snapshot`,
 * `artifacts` (URLs firmadas), `projectRoot` ni rutas. `deserializeExecutionRecord` valida la forma y reconstruye un
 * `ExecutionRecord` con valores inertes para lo que no se persiste.
 */
import type {
  ExecutionRecord,
  ExecutionResultFacts,
  ExecutionPhase,
  ExecutionProfile,
  ExecutionScope,
  SandboxExecutionStatus,
  SandboxStage,
  TestRunner,
} from './domain/execution-record.js';
import { isTerminalStatus } from './domain/execution-record.js';

export const EXECUTION_STATE_SCHEMA_VERSION = 1;
export const SANDBOX_RESTARTED_CODE = 'SANDBOX_RESTARTED';
export const SANDBOX_RESTARTED_MESSAGE = 'El Sandbox se reinició durante la ejecución.';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SANDBOX_STATUSES: readonly SandboxExecutionStatus[] = [
  'PENDING', 'PREPARING', 'INSTALLING_DEPENDENCIES', 'COMPILING', 'RUNNING_TESTS', 'FINALIZING', 'COMPLETED', 'FAILED', 'TIMED_OUT',
];
const SANDBOX_STAGES: readonly SandboxStage[] = ['PREPARING', 'INSTALLING_DEPENDENCIES', 'COMPILING', 'RUNNING_TESTS', 'FINALIZING'];
const SCOPES: readonly ExecutionScope[] = ['TARGET', 'BATCH'];
const PROFILES: readonly ExecutionProfile[] = ['NODE_TYPESCRIPT', 'PHP_LARAVEL_PHPUNIT'];
const RUNNERS: readonly TestRunner[] = ['JEST', 'VITEST', 'PHPUNIT'];
const PHASES: readonly ExecutionPhase[] = ['BASELINE', 'GENERATED_TESTS'];

/** Forma exacta que se escribe en disco (`schemaVersion` + lista blanca). */
export interface PersistedExecutionRecord {
  schemaVersion: typeof EXECUTION_STATE_SCHEMA_VERSION;
  executionId: string;
  requestId: string;
  testRunId: string;
  projectVersionId: string;
  status: SandboxExecutionStatus;
  stage: SandboxStage | null;
  failureCode: string | null;
  failureMessage: string | null;
  result: ExecutionResultFacts | null;
  requestFingerprint: string;
  scope: ExecutionScope;
  targetIds: string[];
  executionProfile: ExecutionProfile;
  runnerHint: TestRunner;
  phase: ExecutionPhase;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class PersistedRecordError extends Error {}

/** Solo los campos de la lista blanca, construidos uno a uno. Nunca `snapshot`, `artifacts`, `projectRoot`. */
export function serializeExecutionRecord(record: ExecutionRecord): PersistedExecutionRecord {
  const result = record.result === null
    ? null
    : {
        facts: record.result.facts,
        failure: record.result.failure,
        stageDurations: record.result.stageDurations,
        appliedArtifactIds: record.result.appliedArtifactIds,
        evidence: record.result.evidence,
      };
  return {
    schemaVersion: EXECUTION_STATE_SCHEMA_VERSION,
    executionId: record.executionId,
    requestId: record.requestId,
    testRunId: record.testRunId,
    projectVersionId: record.projectVersionId,
    status: record.status,
    stage: record.stage,
    failureCode: record.failureCode,
    failureMessage: record.failureMessage,
    result,
    requestFingerprint: record.requestFingerprint,
    scope: record.scope,
    targetIds: [...record.targetIds],
    executionProfile: record.executionProfile,
    runnerHint: record.runnerHint,
    phase: record.phase,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Valida la forma de un archivo ya parseado y reconstruye el registro. Lanza `PersistedRecordError` ante cualquier
 * desajuste; quien llama decide ignorar el archivo con un aviso.
 */
export function deserializeExecutionRecord(raw: unknown): ExecutionRecord {
  const data = asObject(raw, 'el contenido');
  if (data.schemaVersion !== EXECUTION_STATE_SCHEMA_VERSION) {
    throw new PersistedRecordError(`schemaVersion desconocida (${JSON.stringify(data.schemaVersion)})`);
  }
  const executionId = uuid(data, 'executionId');
  const createdAt = isoDate(data, 'createdAt');
  const updatedAt = isoDate(data, 'updatedAt');
  const status = oneOf(data, 'status', SANDBOX_STATUSES);
  const result = nullable(data, 'result', (value) => resultFacts(value));
  if (isTerminalStatus(status) && (result === null || nullableIsoDate(data, 'completedAt') === null)) {
    throw new PersistedRecordError('registro terminal sin result o completedAt');
  }
  return {
    executionId,
    requestId: nonEmptyString(data, 'requestId'),
    testRunId: nonEmptyString(data, 'testRunId'),
    projectVersionId: nonEmptyString(data, 'projectVersionId'),
    // Valores inertes: ningún camino de lectura los usa en un registro restaurado (spec 008).
    snapshot: { role: 'PROJECT_SNAPSHOT', url: '', sha256: '0'.repeat(64), sizeBytes: 0, expiresAt: createdAt },
    projectRoot: '.',
    artifacts: [],
    scope: oneOf(data, 'scope', SCOPES),
    targetIds: stringArray(data, 'targetIds'),
    executionProfile: oneOf(data, 'executionProfile', PROFILES),
    runnerHint: oneOf(data, 'runnerHint', RUNNERS),
    phase: oneOf(data, 'phase', PHASES),
    status,
    stage: nullable(data, 'stage', (value) => enumValue(value, SANDBOX_STAGES, 'stage')),
    failureCode: nullable(data, 'failureCode', (value) => string(value, 'failureCode')),
    failureMessage: nullable(data, 'failureMessage', (value) => string(value, 'failureMessage')),
    result,
    requestFingerprint: nonEmptyString(data, 'requestFingerprint'),
    startedAt: nullableIsoDate(data, 'startedAt'),
    completedAt: nullableIsoDate(data, 'completedAt'),
    createdAt,
    updatedAt,
  };
}

/**
 * Marca un registro no terminal como fallido por reinicio del proceso (spec 008). Función pura: `nowIso` es el
 * instante de la recarga.
 */
export function markInterruptedAsRestarted(record: ExecutionRecord, nowIso: string): ExecutionRecord {
  const stage: SandboxStage = record.stage ?? 'PREPARING';
  return {
    ...record,
    status: 'FAILED',
    stage,
    failureCode: SANDBOX_RESTARTED_CODE,
    failureMessage: SANDBOX_RESTARTED_MESSAGE,
    startedAt: record.startedAt ?? record.createdAt,
    completedAt: nowIso,
    updatedAt: nowIso,
    result: {
      facts: null,
      failure: {
        stage,
        category: 'INFRASTRUCTURE',
        code: SANDBOX_RESTARTED_CODE,
        message: SANDBOX_RESTARTED_MESSAGE,
      },
      stageDurations: [],
      appliedArtifactIds: [],
      evidence: [],
    },
  };
}

// --- validación mínima de forma -------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asObject(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PersistedRecordError(`${what} no es un objeto`);
  }
  return value as Json;
}

function string(value: unknown, key: string): string {
  if (typeof value !== 'string') throw new PersistedRecordError(`${key} debe ser texto`);
  return value;
}

function nonEmptyString(data: Json, key: string): string {
  const value = string(data[key], key);
  if (value.length === 0) throw new PersistedRecordError(`${key} no puede estar vacío`);
  return value;
}

function uuid(data: Json, key: string): string {
  const value = string(data[key], key);
  if (!UUID_PATTERN.test(value)) throw new PersistedRecordError(`${key} no es un UUID`);
  return value;
}

function isoDate(data: Json, key: string): string {
  const value = string(data[key], key);
  if (Number.isNaN(Date.parse(value))) throw new PersistedRecordError(`${key} no es una fecha válida`);
  return value;
}

function nullableIsoDate(data: Json, key: string): string | null {
  return nullable(data, key, (value) => {
    const date = string(value, key);
    if (Number.isNaN(Date.parse(date))) throw new PersistedRecordError(`${key} no es una fecha válida`);
    return date;
  });
}

function nullable<T>(data: Json, key: string, parse: (value: unknown) => T): T | null {
  if (data[key] === null || data[key] === undefined) return null;
  return parse(data[key]);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], key: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new PersistedRecordError(`${key} tiene un valor no permitido`);
  }
  return value as T;
}

function oneOf<T extends string>(data: Json, key: string, allowed: readonly T[]): T {
  return enumValue(data[key], allowed, key);
}

function stringArray(data: Json, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new PersistedRecordError(`${key} debe ser una lista de textos`);
  }
  return [...(value as string[])];
}

function resultFacts(value: unknown): ExecutionResultFacts {
  const data = asObject(value, 'result');
  const failure = nullable(data, 'failure', (item) => {
    const failureData = asObject(item, 'result.failure');
    string(failureData.code, 'result.failure.code');
    string(failureData.message, 'result.failure.message');
    return failureData as unknown as NonNullable<ExecutionResultFacts['failure']>;
  });
  const facts = nullable(data, 'facts', (item) => asObject(item, 'result.facts') as unknown as NonNullable<ExecutionResultFacts['facts']>);
  const evidence = data.evidence;
  const stageDurations = data.stageDurations;
  if (!Array.isArray(evidence) || !Array.isArray(stageDurations)) {
    throw new PersistedRecordError('result.evidence y result.stageDurations deben ser listas');
  }
  return {
    facts,
    failure,
    stageDurations: stageDurations as ExecutionResultFacts['stageDurations'],
    appliedArtifactIds: stringArray(data, 'appliedArtifactIds'),
    evidence: evidence as ExecutionResultFacts['evidence'],
  };
}
