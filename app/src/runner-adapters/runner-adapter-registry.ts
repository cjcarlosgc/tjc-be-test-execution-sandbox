import { Injectable } from '@nestjs/common';
import {
  EXECUTION_PROFILE_RUNNERS,
  type ExecutionProfile,
  type TestRunner,
} from '../common/contracts/sandbox-execution.contract.js';
import {
  UnsupportedExecutionProfileError,
  UnsupportedRunnerError,
} from '../common/errors/sandbox-fact-error.js';
import { JestTestRunnerAdapter } from './jest-test-runner.adapter.js';
import type {
  ProjectRunnerContext,
  TestRunnerAdapter,
} from './test-runner-adapter.js';
import { VitestTestRunnerAdapter } from './vitest-test-runner.adapter.js';

@Injectable()
export class RunnerAdapterRegistry {
  private readonly adapters: TestRunnerAdapter[];

  constructor(jest: JestTestRunnerAdapter, vitest: VitestTestRunnerAdapter) {
    this.adapters = [jest, vitest];
  }

  /**
   * INTEROP-2.0 §7.2/009: `executionProfile` fija el conjunto de runners
   * válidos; una combinación fuera de tabla, o un profile sin adapter
   * implementado (`PHP_LARAVEL_PHPUNIT`), falla explícitamente como
   * `UNSUPPORTED_EXECUTION_PROFILE`/`CONFIGURATION`, sin fallback a otro
   * runtime. `runnerHint` se verifica además contra el proyecto real.
   */
  async resolve(
    executionProfile: ExecutionProfile,
    runnerHint: TestRunner,
    context: ProjectRunnerContext,
  ): Promise<TestRunnerAdapter> {
    const supportedRunners = EXECUTION_PROFILE_RUNNERS[executionProfile];
    if (!supportedRunners.includes(runnerHint)) {
      throw new UnsupportedExecutionProfileError(
        `execution profile ${executionProfile} does not support runner ${runnerHint}`,
      );
    }
    const adapter = this.adapters.find(
      (a) => a.executionProfile === executionProfile && a.runner === runnerHint,
    );
    if (!adapter) {
      throw new UnsupportedExecutionProfileError(
        `no adapter registered for profile ${executionProfile} / runner ${runnerHint}`,
      );
    }
    if (!(await adapter.supports(context))) {
      throw new UnsupportedRunnerError(
        `project does not declare or configure ${runnerHint}`,
      );
    }
    return adapter;
  }
}
