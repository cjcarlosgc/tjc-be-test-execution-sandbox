import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePhpunitJunitXml } from './phpunit-junit-result-parser.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

async function loadFixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

describe('parsePhpunitJunitXml', () => {
  it('parses a real PHPUnit JUnit report with a mix of passed/failed testcases', async () => {
    const raw = await loadFixture('phpunit-mixed.xml');
    const facts = parsePhpunitJunitXml(raw);

    expect(facts.executionProfile).toBe('PHP_LARAVEL_PHPUNIT');
    expect(facts.runner).toBe('PHPUNIT');
    expect(facts.compiled).toBe(true);
    expect(facts.executed).toBe(true);
    expect(facts.passed).toBe(false);
    expect(facts.totalTests).toBe(2);
    expect(facts.passedTests).toBe(1);
    expect(facts.failedTests).toBe(1);
    expect(facts.testCases).toHaveLength(2);
    expect(facts.testCases[0]).toMatchObject({
      name: 'testAddWorks',
      status: 'PASSED',
    });
    expect(facts.testCases[1]).toMatchObject({
      name: 'testSubIsBroken',
      status: 'FAILED',
    });
    expect(facts.testCases[1].errorMessage).toContain('Failed asserting');
    expect(facts.testCases[1].durationMs).toBe(1);
  });

  it('parses a real PHPUnit JUnit report where everything passes', async () => {
    const raw = await loadFixture('phpunit-passing.xml');
    const facts = parsePhpunitJunitXml(raw);

    expect(facts.passed).toBe(true);
    expect(facts.failedTests).toBe(0);
    expect(facts.testCases.every((tc) => tc.status === 'PASSED')).toBe(true);
  });

  it('flattens nested testsuite elements and maps <error>/<skipped> correctly', async () => {
    const raw = await loadFixture('phpunit-error-and-skipped.xml');
    const facts = parsePhpunitJunitXml(raw);

    expect(facts.totalTests).toBe(3);
    expect(facts.testCases.map((tc) => tc.status)).toEqual([
      'FAILED',
      'SKIPPED',
      'PASSED',
    ]);
    expect(facts.testCases[0].errorMessage).toContain('RuntimeException');
    expect(facts.passed).toBe(false);
  });

  it('never treats a report with no testsuites as executed/passing', () => {
    const facts = parsePhpunitJunitXml('<testsuites></testsuites>');

    expect(facts.executed).toBe(false);
    expect(facts.passed).toBe(false);
    expect(facts.totalTests).toBe(0);
  });
});
