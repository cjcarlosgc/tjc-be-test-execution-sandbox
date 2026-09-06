import { Injectable } from '@nestjs/common';
import type { RunnerHint } from '../common/contracts/sandbox-execution.contract.js';
import { UnsupportedRunnerError } from '../common/errors/sandbox-fact-error.js';
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
   * INTEROP-1.1 §7.2: `runnerHint` se verifica contra el proyecto; una
   * incompatibilidad se persiste como `UNSUPPORTED_RUNNER`/`CONFIGURATION`,
   * nunca ejecuta el comando de otro runner por conveniencia.
   */
  async resolve(
    runnerHint: RunnerHint,
    context: ProjectRunnerContext,
  ): Promise<TestRunnerAdapter> {
    const adapter = this.adapters.find((a) => a.runner === runnerHint);
    if (!adapter) {
      throw new UnsupportedRunnerError(
        `no adapter registered for runner ${runnerHint}`,
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
