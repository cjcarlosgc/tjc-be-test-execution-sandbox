import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhpunitTestRunnerAdapter } from './phpunit-test-runner.adapter.js';

describe('PhpunitTestRunnerAdapter', () => {
  let workspacePath: string;
  const adapter = new PhpunitTestRunnerAdapter();

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'phpunit-adapter-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('declares its profile and runner', () => {
    expect(adapter.executionProfile).toBe('PHP_LARAVEL_PHPUNIT');
    expect(adapter.runner).toBe('PHPUNIT');
  });

  it('supports a project that declares phpunit/phpunit in require-dev', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'composer.json'),
      JSON.stringify({ 'require-dev': { 'phpunit/phpunit': '^11.0' } }),
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(true);
  });

  it('supports a project with a phpunit.xml.dist even without the composer dependency declared', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'phpunit.xml.dist'),
      '<phpunit></phpunit>',
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(true);
  });

  it('does not support a project with neither the dependency nor a config file', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'composer.json'),
      JSON.stringify({ require: {} }),
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(false);
  });

  it('builds the phpunit command with --log-junit pointing at resultsFilePath', () => {
    const command = adapter.buildCommand({
      workspacePath,
      resultsFilePath: '/app/.sandbox-results.json',
    });

    expect(command).toEqual([
      'php',
      'vendor/bin/phpunit',
      '--log-junit',
      '/app/.sandbox-results.json',
    ]);
  });
});
