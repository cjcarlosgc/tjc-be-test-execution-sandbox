import type {
  SandboxExecutionAcceptedResponse as ContractAccepted,
  SandboxExecutionResultResponse as ContractResult,
  SandboxExecutionStatusResponse as ContractStatus,
} from '../../contracts/generated/contract-types.js';

// Respuestas HTTP de §7: se derivan del contrato generado (spec/contracts/schemas); no se redefinen a mano.
export type AsyncAccepted = Pick<ContractAccepted, 'status' | 'pollAfterMs'>; // INTEROP §5
export type SandboxExecutionAcceptedResponse = ContractAccepted;
export type SandboxExecutionStatusResponse = ContractStatus;
export type SandboxExecutionResultResponse = ContractResult;
