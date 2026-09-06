import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JestTestRunnerAdapter } from './jest-test-runner.adapter.js';

describe('JestTestRunnerAdapter', () => {
  let workspacePath: string;
  const adapter = new JestTestRunnerAdapter();

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'jest-adapter-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('reports support when package.json declares jest as a devDependency', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(true);
  });

  it('reports support when a jest.config.js file exists', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'jest.config.js'),
      'module.exports = {};',
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(true);
  });

  it('does not report support for a project with no jest signal', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
    );

    await expect(
      adapter.supports({ workspacePath, resultsFilePath: 'x' }),
    ).resolves.toBe(false);
  });

  it('builds a command that writes JSON to the requested results file', () => {
    const command = adapter.buildCommand({
      workspacePath,
      resultsFilePath: '/tmp/results.json',
    });

    expect(command).toEqual([
      'node_modules/.bin/jest',
      '--ci',
      '--json',
      '--outputFile=/tmp/results.json',
    ]);
  });
});
