import { Module } from '@nestjs/common';
import { JestTestRunnerAdapter } from './jest-test-runner.adapter.js';
import { PhpunitTestRunnerAdapter } from './phpunit-test-runner.adapter.js';
import { RunnerAdapterRegistry } from './runner-adapter-registry.js';
import { VitestTestRunnerAdapter } from './vitest-test-runner.adapter.js';

@Module({
  providers: [
    JestTestRunnerAdapter,
    VitestTestRunnerAdapter,
    PhpunitTestRunnerAdapter,
    RunnerAdapterRegistry,
  ],
  exports: [RunnerAdapterRegistry],
})
export class RunnerAdaptersModule {}
