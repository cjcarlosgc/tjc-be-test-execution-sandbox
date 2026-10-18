/**
 * Formato en disco del estado de una ejecución (WI-SANDBOX-010, spec 008 «Persistencia del estado de ejecuciones»).
 *
 * Funciones puras: `serializeExecutionRecord` aplica una LISTA BLANCA campo a campo y nunca copia `snapshot`,
 * `artifacts` (URLs firmadas), `projectRoot` ni rutas. `deserializeExecutionRecord` valida la forma y reconstruye un
 * `ExecutionRecord` con valores inertes para lo que no se persiste.
 */
import { isAbsolute, parse, resolve } from 'node:path';
import type {
  ExecutionRecord,
  ExecutionResultFacts,
  ExecutionPhase,
  ExecutionProfile,
  ExecutionScope,
  RunnerFacts,
  SandboxExecutionStatus,
  SandboxStage,
  TestRunner,
} from './domain/execution-record.js';
import { isTerminalStatus } from './domain/execution-record.js';

export const EXECUTION_STATE_SCHEMA_VERSION = 1;
export const SANDBOX_RESTARTED_CODE = 'SANDBOX_RESTARTED';
export const SANDBOX_RESTARTED_MESSAGE = 'El Sandbox se reinició durante la ejecución.';

export const REDACTED_URL = '[url-redactada]';
export const REDACTED_PATH = '[ruta-redactada]';
const URL_PATTERN = /https?:\/\/[^\s"'`()<>]+/gi;
/** Tras una ruta del host se consume el resto del token (sin espacios ni comillas), para no dejar huellas del workspace. */
const PATH_TAIL_SOURCE = /(?:[\\/][^\s"'`()<>,;]*)?/.source;
/** Una ruta no termina a mitad de un nombre: `/srv/ws` no casa con `/srv/wsx` ni con `/srv/ws-old`. */
const PATH_BOUNDARY_SOURCE = /(?![A-Za-z0-9_-]|\.\w)/.source;

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

/**
 * Sustituye en un texto libre todas las URLs `http(s)://` por `[url-redactada]` y las rutas absolutas conocidas por el
 * proceso (`hostPaths`) por `[ruta-redactada]`. Las rutas se comparan de forma literal, la más larga primero, y se
 * descartan las relativas, la raíz del sistema y las vacías. Función pura: no toca el sistema de archivos.
 */
export function redactSensitiveText(text: string, hostPaths: readonly string[]): string {
  const withoutUrls = text.replace(URL_PATTERN, REDACTED_URL);
  return hostPathsLongestFirst(hostPaths).reduce(
    (current, hostPath) => current.replace(hostPathPattern(hostPath), REDACTED_PATH),
    withoutUrls,
  );
}

function hostPathsLongestFirst(hostPaths: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const candidate of hostPaths) {
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || !isAbsolute(trimmed)) continue;
    const path = resolve(trimmed);
    if (path === parse(path).root) continue;
    normalized.add(path);
  }
  return [...normalized].sort((a, b) => b.length - a.length);
}

function hostPathPattern(hostPath: string): RegExp {
  return new RegExp(`${escapeRegExp(hostPath)}${PATH_BOUNDARY_SOURCE}${PATH_TAIL_SOURCE}`, 'g');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Solo los campos de la lista blanca, construidos uno a uno. Nunca `snapshot`, `artifacts`, `projectRoot`.
 * Los textos libres (`failureMessage`, `failure.message`, `evidence[].content` y los textos de casos de prueba) pasan
 * por `redactSensitiveText` con `hostPaths`. Ids, códigos, enums y fechas no se tocan.
 */
export function serializeExecutionRecord(
  record: ExecutionRecord,
  hostPaths: readonly string[] = [],
): PersistedExecutionRecord {
  const redact = (text: string): string => redactSensitiveText(text, hostPaths);
  return {
    schemaVersion: EXECUTION_STATE_SCHEMA_VERSION,
    executionId: record.executionId,
    requestId: record.requestId,
    testRunId: record.testRunId,
    projectVersionId: record.projectVersionId,
    status: record.status,
    stage: record.stage,
    failureCode: record.failureCode,
    failureMessage: record.failureMessage === null ? null : redact(record.failureMessage),
    result: record.result === null ? null : redactResult(record.result, redact),
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

type Redact = (text: string) => string;

function redactResult(result: ExecutionResultFacts, redact: Redact): ExecutionResultFacts {
  return {
    facts: result.facts === null ? null : redactFacts(result.facts, redact),
    failure: result.failure === null ? null : { ...result.failure, message: redact(result.failure.message) },
    stageDurations: result.stageDurations.map((duration) => ({ ...duration })),
    appliedArtifactIds: [...result.appliedArtifactIds],
    evidence: result.evidence.map((item) => ({ ...item, content: redact(item.content) })),
  };
}

function redactFacts(facts: RunnerFacts, redact: Redact): RunnerFacts {
  const testCases = Array.isArray(facts.testCases)
    ? facts.testCases.map((testCase) => ({
        ...testCase,
        name: redactOptional(testCase.name, redact),
        suitePath: redactOptional(testCase.suitePath, redact),
        errorMessage: redactOptional(testCase.errorMessage, redact),
      }))
    : facts.testCases;
  return { ...facts, testCases };
}

function redactOptional<T extends string | null>(value: T, redact: Redact): T {
  return (typeof value === 'string' ? redact(value) : value) as T;
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
