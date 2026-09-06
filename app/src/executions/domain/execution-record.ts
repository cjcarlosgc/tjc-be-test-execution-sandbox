import type {
  EphemeralDownloadRef,
  ExecutionArtifactInput,
  ExecutionResultFacts,
  ExecutionScope,
  RunnerHint,
  SandboxExecutionStatus,
  SandboxStage,
} from '../../common/contracts/sandbox-execution.contract.js';

export * from '../../common/contracts/sandbox-execution.contract.js';

export interface ExecutionRecord {
  executionId: string;
  requestId: string;
  testRunId: string;
  projectVersionId: string;
  snapshot: EphemeralDownloadRef;
  artifacts: ExecutionArtifactInput[];
  scope: ExecutionScope;
  targetIds: string[];
  runnerHint: RunnerHint;
  status: SandboxExecutionStatus;
  stage: SandboxStage | null;
  failureCode: string | null;
  failureMessage: string | null;
  result: ExecutionResultFacts | null;
  requestFingerprint: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
