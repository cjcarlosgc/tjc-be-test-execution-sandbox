import type { SandboxFailureCategory } from '../contracts/sandbox-execution.contract.js';

/**
 * Represents a pipeline-stage failure that must be persisted as a factual
 * `SandboxFailureFact` (INTEROP-1.1 §7.3/§7.4), never surfaced as an HTTP 5xx
 * once the execution has been accepted with `202` (see `errors` transversal spec).
 */
export class SandboxFactError extends Error {
  readonly code: string;
  readonly category: SandboxFailureCategory;

  constructor(code: string, category: SandboxFailureCategory, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.category = category;
  }
}

export class InputUrlExpiredError extends SandboxFactError {
  constructor(message: string) {
    super('INPUT_URL_EXPIRED', 'CONFIGURATION', message);
  }
}

export class InputDownloadFailedError extends SandboxFactError {
  constructor(
    message: string,
    category: SandboxFailureCategory = 'INFRASTRUCTURE',
  ) {
    super('INPUT_DOWNLOAD_FAILED', category, message);
  }
}

export class IntegrityCheckFailedError extends SandboxFactError {
  constructor(message: string) {
    super('INTEGRITY_CHECK_FAILED', 'INFRASTRUCTURE', message);
  }
}

export class InvalidArchiveError extends SandboxFactError {
  constructor(message: string) {
    super('INVALID_ARCHIVE', 'CONFIGURATION', message);
  }
}

export class InvalidArtifactPathError extends SandboxFactError {
  constructor(message: string) {
    super('INVALID_ARTIFACT_PATH', 'CONFIGURATION', message);
  }
}

export class UnsupportedRunnerError extends SandboxFactError {
  constructor(message: string) {
    super('UNSUPPORTED_RUNNER', 'CONFIGURATION', message);
  }
}

/** `DEC-SBX-002` (APROBADO): V1 solo soporta pnpm. */
export class UnsupportedPackageManagerError extends SandboxFactError {
  constructor(message: string) {
    super('UNSUPPORTED_PACKAGE_MANAGER', 'CONFIGURATION', message);
  }
}

export class DependencyInstallFailedError extends SandboxFactError {
  constructor(message: string) {
    super('DEPENDENCY_INSTALL_FAILED', 'DEPENDENCY', message);
  }
}

export class TestExecutionFailedError extends SandboxFactError {
  constructor(message: string) {
    super('TEST_EXECUTION_FAILED', 'TEST_RUNTIME', message);
  }
}

/**
 * Marca un `SandboxFactError` cuya causa es un timeout de etapa: el
 * pipeline usa `instanceof` para reportar `status: 'TIMED_OUT'` en vez de
 * `'FAILED'` (resource-limits: "Exceder tiempo produce TIMED_OUT").
 */
export class SandboxTimeoutError extends SandboxFactError {}
