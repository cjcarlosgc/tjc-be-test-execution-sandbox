/**
 * Vocabulario compartido de INTEROP §7 (Core <-> Sandbox). Los tipos de cable se derivan del contrato generado
 * (`spec/contracts/schemas`, ver `src/contracts/generated`); aquí solo viven las constantes y los tipos internos.
 * Vive fuera de `executions/` para que módulos de nivel inferior (workspace, materialization) puedan tipar sus
 * errores/resultados sin depender de la feature HTTP.
 */
import type {
  ArtifactType,
  EphemeralDownloadRef as ContractEphemeralDownloadRef,
  ExecutionArtifactInput as ContractExecutionArtifactInput,
  ExecutionEvidenceFact as ContractExecutionEvidenceFact,
  ExecutionInputRole as ContractExecutionInputRole,
  ExecutionPhase as ContractExecutionPhase,
  ExecutionProfile as ContractExecutionProfile,
  ExecutionScope as ContractExecutionScope,
  RunnerFacts as ContractRunnerFacts,
  SandboxExecutionStatus as ContractSandboxExecutionStatus,
  SandboxFailureFact as ContractSandboxFailureFact,
  SandboxStage as ContractSandboxStage,
  StageDuration as ContractStageDuration,
  TestCaseFact as ContractTestCaseFact,
  TestRunner as ContractTestRunner,
} from '../../contracts/generated/contract-types.js';

export type ExecutionInputRole = ContractExecutionInputRole;
export type ExecutionArtifactType = ArtifactType;
export type SandboxStage = ContractSandboxStage;
export type SandboxExecutionStatus = ContractSandboxExecutionStatus;
export type ExecutionScope = ContractExecutionScope;
/**
 * INTEROP §7.2: `BASELINE` ejecuta la suite existente; `GENERATED_TESTS` ejecuta solo los artefactos
 * materializados. Opcional en el request mientras Core no lo envíe; default `GENERATED_TESTS`.
 */
export type ExecutionPhase = ContractExecutionPhase;
export const DEFAULT_EXECUTION_PHASE: ExecutionPhase = 'GENERATED_TESTS';
export type ExecutionProfile = ContractExecutionProfile;
export type TestRunner = ContractTestRunner;

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

export type EphemeralDownloadRef = ContractEphemeralDownloadRef;
export type ExecutionArtifactInput = ContractExecutionArtifactInput;

export type TestCaseFactStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TODO';

/**
 * Hecho del runner, no una clasificación: `ASSERTION` = la aserción no se
 * cumplió; `ERROR` = el test lanzó antes o en vez de verificar (clase/método
 * inexistente, TypeError, excepción). Null si el caso no falló.
 */
export type TestCaseFailureKind = 'ASSERTION' | 'ERROR';

export type TestCaseFact = ContractTestCaseFact;
export type RunnerFacts = ContractRunnerFacts;
export type StageDuration = ContractStageDuration;

export type SandboxFailureFact = ContractSandboxFailureFact;
export type SandboxFailureCategory = SandboxFailureFact['category'];

export type ExecutionEvidenceFact = ContractExecutionEvidenceFact;
export type ExecutionEvidenceKind = ExecutionEvidenceFact['kind'];

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
