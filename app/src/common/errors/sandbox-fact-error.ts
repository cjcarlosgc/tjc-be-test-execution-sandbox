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

/**
 * `executionProfile`/`runnerHint` no forman una combinación soportada (009,
 * INTEROP-2.0 §7.2), o el profile todavía no tiene adapter implementado
 * (p.ej. `PHP_LARAVEL_PHPUNIT` antes de HU43 corte PHP). Nunca cae de vuelta
 * a otro runtime por conveniencia.
 */
export class UnsupportedExecutionProfileError extends SandboxFactError {
  constructor(message: string) {
    super('UNSUPPORTED_EXECUTION_PROFILE', 'CONFIGURATION', message);
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
 * El runner abortó por una configuración inválida del proyecto (p.ej.
 * `testEnvironment: jsdom` sin declarar `jest-environment-jsdom` como
 * devDependency tras Jest 28) antes de ejecutar ningún test: no escribe
 * `.sandbox-results.json`, pero a diferencia de `TestExecutionFailedError`
 * le pasaría a cualquier test, incluso uno vacío, así que no es un fallo del
 * test generado.
 */
export class TestEnvironmentConfigurationError extends SandboxFactError {
  constructor(message: string) {
    super('TEST_ENVIRONMENT_CONFIGURATION_INVALID', 'CONFIGURATION', message);
  }
}

/**
 * Marca un `SandboxFactError` cuya causa es un timeout de etapa: el
 * pipeline usa `instanceof` para reportar `status: 'TIMED_OUT'` en vez de
 * `'FAILED'` (resource-limits: "Exceder tiempo produce TIMED_OUT").
 */
export class SandboxTimeoutError extends SandboxFactError {}

/**
 * El container fue terminado por exceder el límite de memoria configurado
 * (`State.OOMKilled`, resource-limits: "Normalización de OOM"). Es un límite
 * de plataforma, no un problema lógico de la dependencia/prueba en sí.
 */
export class OomKilledError extends SandboxFactError {
  constructor(message: string) {
    super('OOM_KILLED', 'INFRASTRUCTURE', message);
  }
}

/**
 * Sustituto a nivel de aplicación de una cuota de disco por container:
 * Docker no puede aplicarla con el storage driver `overlay2` (default de
 * Docker Desktop). Ver `resource-limits` transversal.
 */
export class WorkspaceDiskLimitExceededError extends SandboxFactError {
  constructor(message: string) {
    super('WORKSPACE_DISK_LIMIT_EXCEEDED', 'INFRASTRUCTURE', message);
  }
}
