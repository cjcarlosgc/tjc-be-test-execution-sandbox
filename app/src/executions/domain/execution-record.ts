import type {
  EphemeralDownloadRef,
  ExecutionArtifactInput,
  ExecutionPhase,
  ExecutionProfile,
  ExecutionResultFacts,
  ExecutionScope,
  SandboxExecutionStatus,
  SandboxStage,
  TestRunner,
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
  executionProfile: ExecutionProfile;
  runnerHint: TestRunner;
  phase: ExecutionPhase;
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
