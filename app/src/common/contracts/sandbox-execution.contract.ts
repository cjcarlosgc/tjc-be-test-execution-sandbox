/**
 * Vocabulario compartido de INTEROP-1.1 §7 (Core <-> Sandbox). Vive fuera de
 * `executions/` para que módulos de nivel inferior (workspace, materialization)
 * puedan tipar sus errores/resultados sin depender de la feature HTTP.
 */

export type ExecutionInputRole = 'PROJECT_SNAPSHOT' | 'GENERATED_ARTIFACT';
export type ExecutionArtifactType = 'CREATED' | 'MODIFIED';
export type SandboxStage =
  | 'PREPARING'
  | 'INSTALLING_DEPENDENCIES'
  | 'COMPILING'
  | 'RUNNING_TESTS'
  | 'FINALIZING';
export type SandboxExecutionStatus =
  | 'PENDING'
  | SandboxStage
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT';
export type ExecutionScope = 'TARGET' | 'BATCH';
export type ExecutionProfile = 'NODE_TYPESCRIPT' | 'PHP_LARAVEL_PHPUNIT';
export type TestRunner = 'JEST' | 'VITEST' | 'PHPUNIT';

/**
 * INTEROP-2.0 §7.2: el profile fija el conjunto de runners aceptados; una
 * combinación fuera de esta tabla falla explícitamente como `CONFIGURATION`,
 * sin inferir ni degradar a otro runtime.
 */
export const EXECUTION_PROFILE_RUNNERS: Record<
  ExecutionProfile,
  readonly TestRunner[]
> = {
  NODE_TYPESCRIPT: ['JEST', 'VITEST'],
  PHP_LARAVEL_PHPUNIT: ['PHPUNIT'],
};

export interface EphemeralDownloadRef {
  role: ExecutionInputRole;
  url: string;
  expiresAt: string;
  sha256: string;
  sizeBytes: number;
}

export interface ExecutionArtifactInput {
  artifactId: string;
  relativePath: string;
  artifactType: ExecutionArtifactType;
  download: EphemeralDownloadRef;
}

export type TestCaseFactStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TODO';

export interface TestCaseFact {
  suitePath: string | null;
  name: string;
  status: TestCaseFactStatus;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface RunnerFacts {
  executionProfile: ExecutionProfile;
  runner: TestRunner;
  compiled: boolean;
  executed: boolean;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  testCases: TestCaseFact[];
  testCasesTruncated: boolean;
}

export interface StageDuration {
  stage: SandboxStage;
  durationMs: number;
}

export type SandboxFailureCategory =
  | 'COMPILATION'
  | 'TEST_ASSERTION'
  | 'TEST_RUNTIME'
  | 'DEPENDENCY'
  | 'CONFIGURATION'
  | 'INFRASTRUCTURE'
  | 'UNKNOWN';

export interface SandboxFailureFact {
  stage: SandboxStage;
  category: SandboxFailureCategory;
  code: string;
  message: string;
}

export type ExecutionEvidenceKind =
  | 'COMPILER_STDOUT'
  | 'COMPILER_STDERR'
  | 'TEST_STDOUT'
  | 'TEST_STDERR'
  | 'RUNNER_REPORT';

export interface ExecutionEvidenceFact {
  kind: ExecutionEvidenceKind;
  stage: SandboxStage;
  content: string;
  truncated: boolean;
  originalBytes: number | null;
}

export interface ExecutionResultFacts {
  facts: RunnerFacts | null;
  failure: SandboxFailureFact | null;
  stageDurations: StageDuration[];
  appliedArtifactIds: string[];
  evidence: ExecutionEvidenceFact[];
}

export function isTerminalStatus(
  status: SandboxExecutionStatus,
): status is 'COMPLETED' | 'FAILED' | 'TIMED_OUT' {
  return (
    status === 'COMPLETED' || status === 'FAILED' || status === 'TIMED_OUT'
  );
}
