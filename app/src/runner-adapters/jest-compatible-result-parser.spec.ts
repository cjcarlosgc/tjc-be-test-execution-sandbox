import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InvalidArchiveError } from '../common/errors/sandbox-fact-error.js';
import { parseJestCompatibleJson } from './jest-compatible-result-parser.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

async function loadFixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

describe('parseJestCompatibleJson', () => {
  it('parses a real Jest run with a mix of passed/failed assertions', async () => {
    const raw = await loadFixture('jest-mixed.json');
    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST',raw);

    expect(facts.runner).toBe('JEST');
    expect(facts.compiled).toBe(true);
    expect(facts.executed).toBe(true);
    expect(facts.passed).toBe(false);
    expect(facts.totalTests).toBe(2);
    expect(facts.passedTests).toBe(1);
    expect(facts.failedTests).toBe(1);
    expect(facts.testCases).toHaveLength(2);
    expect(facts.testCases[0]).toMatchObject({
      name: 'add works',
      status: 'PASSED',
    });
    expect(facts.testCases[1]).toMatchObject({
      name: 'sub is broken',
      status: 'FAILED',
    });
    expect(facts.testCases[1].errorMessage).toContain('toBe');
  });

  it('parses a real Jest run where everything passes', async () => {
    const raw = await loadFixture('jest-passing.json');
    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST',raw);

    expect(facts.passed).toBe(true);
    expect(facts.failedTests).toBe(0);
    expect(facts.testCases.every((tc) => tc.status === 'PASSED')).toBe(true);
  });

  it('marks compiled=false and executed=false for a real Jest syntax error', async () => {
    const raw = await loadFixture('jest-syntax-error.json');
    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST',raw);

    expect(facts.compiled).toBe(false);
    expect(facts.executed).toBe(false);
    expect(facts.totalTests).toBe(0);
    expect(facts.testCases).toHaveLength(0);
  });

  it('parses a real Vitest run with a mix of passed/failed assertions', async () => {
    const raw = await loadFixture('vitest-mixed.json');
    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST',raw);

    expect(facts.runner).toBe('VITEST');
    expect(facts.compiled).toBe(true);
    expect(facts.executed).toBe(true);
    expect(facts.passed).toBe(false);
    expect(facts.totalTests).toBe(2);
    expect(facts.testCases.map((tc) => tc.status)).toEqual([
      'PASSED',
      'FAILED',
    ]);
  });

  it('parses a real Vitest run where everything passes', async () => {
    const raw = await loadFixture('vitest-passing.json');
    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST',raw);

    expect(facts.passed).toBe(true);
    expect(facts.failedTests).toBe(0);
  });

  it('throws InvalidArchiveError for output that is not JSON', () => {
    expect(() => parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST','not json')).toThrow(
      InvalidArchiveError,
    );
  });

  it('never treats an unrecognized assertion status as passing', () => {
    const raw = JSON.stringify({
      success: false,
      numTotalTests: 1,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: 'weird.test.ts',
          status: 'passed',
          assertionResults: [
            { title: 'mystery', status: 'interrupted', duration: 1 },
          ],
        },
      ],
    });

    const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST',raw);
    expect(facts.testCases[0].status).toBe('FAILED');
  });
});
