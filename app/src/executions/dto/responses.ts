import type {
  ExecutionEvidenceFact,
  RunnerFacts,
  SandboxExecutionStatus,
  SandboxFailureFact,
  SandboxStage,
  StageDuration,
} from '../domain/execution-record.js';

export interface AsyncAccepted {
  status: 'PENDING';
  pollAfterMs: number;
}

export interface SandboxExecutionAcceptedResponse extends AsyncAccepted {
  executionId: string;
  requestId: string;
  projectVersionId: string;
}

export interface SandboxExecutionStatusResponse {
  executionId: string;
  requestId: string;
  projectVersionId: string;
  status: SandboxExecutionStatus;
  stage: SandboxStage | null;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxExecutionResultResponse {
  executionId: string;
  requestId: string;
  testRunId: string;
  projectVersionId: string;
  status: 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
  facts: RunnerFacts | null;
  failure: SandboxFailureFact | null;
  stageDurations: StageDuration[];
  appliedArtifactIds: string[];
  evidence: ExecutionEvidenceFact[];
  startedAt: string;
  completedAt: string;
}
