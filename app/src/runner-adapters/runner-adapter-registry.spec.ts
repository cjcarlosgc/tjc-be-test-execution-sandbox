import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  UnsupportedExecutionProfileError,
  UnsupportedRunnerError,
} from '../common/errors/sandbox-fact-error.js';
import { JestTestRunnerAdapter } from './jest-test-runner.adapter.js';
import { RunnerAdapterRegistry } from './runner-adapter-registry.js';
import { VitestTestRunnerAdapter } from './vitest-test-runner.adapter.js';

describe('RunnerAdapterRegistry', () => {
  let workspacePath: string;
  const registry = new RunnerAdapterRegistry(
    new JestTestRunnerAdapter(),
    new VitestTestRunnerAdapter(),
  );

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('resolves the Jest adapter when the hint matches the project', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );

    const adapter = await registry.resolve('NODE_TYPESCRIPT', 'JEST', {
      workspacePath,
      resultsFilePath: 'x',
    });

    expect(adapter.runner).toBe('JEST');
  });

  it('rejects with UNSUPPORTED_RUNNER when the hint does not match the project', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );

    await expect(
      registry.resolve('NODE_TYPESCRIPT', 'VITEST', {
        workspacePath,
        resultsFilePath: 'x',
      }),
    ).rejects.toThrow(UnsupportedRunnerError);
  });

  it('rejects with UNSUPPORTED_EXECUTION_PROFILE when the runner is not in the profile table, without falling back', async () => {
    await expect(
      registry.resolve('NODE_TYPESCRIPT', 'PHPUNIT', {
        workspacePath,
        resultsFilePath: 'x',
      }),
    ).rejects.toThrow(UnsupportedExecutionProfileError);
  });

  it('rejects with UNSUPPORTED_EXECUTION_PROFILE for PHP_LARAVEL_PHPUNIT, which has no adapter yet', async () => {
    await expect(
      registry.resolve('PHP_LARAVEL_PHPUNIT', 'PHPUNIT', {
        workspacePath,
        resultsFilePath: 'x',
      }),
    ).rejects.toThrow(UnsupportedExecutionProfileError);
  });
});
