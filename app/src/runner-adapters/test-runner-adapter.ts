import type { RunnerFacts, RunnerHint } from '../common/contracts/sandbox-execution.contract.js';

export interface ProjectRunnerContext {
  workspacePath: string;
  /** Ruta absoluta donde el comando debe escribir el reporte JSON del runner. */
  resultsFilePath: string;
}

/**
 * Normaliza Jest y Vitest a un resultado común (005-test-runner-adapters).
 * `buildCommand`/`parseResult` no ejecutan nada por sí mismos: producen el
 * argv y consumen el reporte que 004-container-execution invocará una vez
 * `DEC-SBX-002` permita instalar dependencias.
 */
export interface TestRunnerAdapter {
  readonly runner: RunnerHint;
  supports(context: ProjectRunnerContext): Promise<boolean>;
  buildCommand(context: ProjectRunnerContext): string[];
  parseResult(rawOutput: string): RunnerFacts;
}
