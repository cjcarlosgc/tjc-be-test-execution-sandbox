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

  describe('failureKind (009, corte T-003)', () => {
    it('maps <failure> to ASSERTION and passing cases to null', async () => {
      const facts = parsePhpunitJunitXml(await loadFixture('phpunit-mixed.xml'));
      expect(facts.testCases.map((tc) => tc.failureKind)).toEqual([null, 'ASSERTION']);
    });

    it('maps <error> to ERROR and <skipped> to null', async () => {
      const facts = parsePhpunitJunitXml(await loadFixture('phpunit-error-and-skipped.xml'));
      expect(facts.testCases.map((tc) => tc.failureKind)).toEqual(['ERROR', null, null]);
    });
  });
});

describe('parsePhpunitJunitXml: suitePath relativo (INTEROP §7.3, RelativePath)', () => {
  it('relativiza un nombre de suite absoluto bajo la raíz del contenedor y deja los nombres de clase intactos', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="/app/tests/Unit/MathTest.php" tests="1" assertions="1" errors="0" failures="0" skipped="0" time="0.001">
    <testcase name="testAddWorks" class="MathTest" classname="MathTest" file="/app/tests/Unit/MathTest.php" line="10" assertions="1" time="0.001"/>
  </testsuite>
  <testsuite name="MathTest" tests="1" assertions="1" errors="0" failures="0" skipped="0" time="0.001">
    <testcase name="testSubWorks" class="MathTest" classname="MathTest" file="/app/tests/Unit/MathTest.php" line="12" assertions="1" time="0.001"/>
  </testsuite>
</testsuites>`;
    const facts = parsePhpunitJunitXml(xml, '/app');
    expect(facts.testCases.map((tc) => tc.suitePath)).toEqual(['tests/Unit/MathTest.php', 'MathTest']);
  });

  it('reduce a nombre base un nombre de suite absoluto fuera de la raíz', () => {
    const xml = `<?xml version="1.0"?>
<testsuites><testsuite name="C:\\work\\MathTest.php" tests="1"><testcase name="t" class="MathTest" time="0.001"/></testsuite></testsuites>`;
    expect(parsePhpunitJunitXml(xml, '/app').testCases[0]!.suitePath).toBe('MathTest.php');
  });
});
