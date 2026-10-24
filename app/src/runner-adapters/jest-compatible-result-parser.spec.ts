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

  describe('failureKind (009, corte T-003)', () => {
    it('marks a real Jest expect() failure as ASSERTION and passing cases as null', async () => {
      const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST', await loadFixture('jest-mixed.json'));
      expect(facts.testCases.map((tc) => tc.failureKind)).toEqual([null, 'ASSERTION']);
    });

    it('marks a real Vitest AssertionError as ASSERTION', async () => {
      const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST', await loadFixture('vitest-mixed.json'));
      expect(facts.testCases.map((tc) => tc.failureKind)).toEqual([null, 'ASSERTION']);
    });

    it('marks a thrown TypeError (no matcher result) as ERROR', () => {
      const raw = JSON.stringify({
        success: false,
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        numPendingTests: 0,
        testResults: [
          {
            name: 'svc.test.ts',
            status: 'failed',
            assertionResults: [
              {
                title: 'calls missing method',
                status: 'failed',
                failureMessages: ["TypeError: svc.total is not a function\n    at svc.test.ts:4"],
                failureDetails: [{}],
              },
            ],
          },
        ],
      });
      const facts = parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST', raw);
      expect(facts.testCases[0].failureKind).toBe('ERROR');
    });
  });
});

describe('parseJestCompatibleJson: suitePath relativo (INTEROP §7.3, RelativePath)', () => {
  /** Reporte mínimo con un único archivo de suite cuyo nombre se parametriza. */
  const reportFor = (suiteName: string) =>
    JSON.stringify({
      success: true,
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          name: suiteName,
          status: 'passed',
          assertionResults: [{ title: 'works', status: 'passed', duration: 1, failureMessages: [] }],
        },
      ],
    });
  const suitePathFor = (suiteName: string, containerRoot?: string) =>
    parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST', reportFor(suiteName), containerRoot).testCases[0]!
      .suitePath;

  it('relativiza una ruta absoluta bajo la raíz del proyecto dentro del contenedor', () => {
    expect(suitePathFor('/app/src/math.test.ts', '/app')).toBe('src/math.test.ts');
    expect(suitePathFor('/app/apps/web/src/a.test.ts', '/app/apps/web')).toBe('src/a.test.ts');
  });

  it('acepta una raíz con barra final', () => {
    expect(suitePathFor('/app/src/math.test.ts', '/app/')).toBe('src/math.test.ts');
  });

  it('deja una ruta ya relativa normalizada con separadores POSIX', () => {
    expect(suitePathFor('src/math.test.ts', '/app')).toBe('src/math.test.ts');
    expect(suitePathFor('./src/math.test.ts')).toBe('src/math.test.ts');
    expect(suitePathFor('src\\nested\\math.test.ts', '/app')).toBe('src/nested/math.test.ts');
  });

  it('reduce a su nombre base una ruta absoluta fuera de la raíz, sin emitir ruta absoluta', () => {
    expect(suitePathFor('/private/tmp/runner/src/math.test.js', '/app')).toBe('math.test.js');
    expect(suitePathFor('/app-evil/src/math.test.ts', '/app')).toBe('math.test.ts');
    expect(suitePathFor('/private/tmp/runner/src/math.test.js')).toBe('math.test.js');
  });

  it('reduce a su nombre base una ruta de Windows (con unidad o con separadores \\), nunca la emite absoluta', () => {
    expect(suitePathFor('C:\\work\\app\\src\\math.test.ts', '/app')).toBe('math.test.ts');
    expect(suitePathFor('\\\\server\\share\\math.test.ts', '/app')).toBe('math.test.ts');
    expect(suitePathFor('C:/work/app/src/math.test.ts')).toBe('math.test.ts');
  });

  it('nunca emite una ruta con ".." y reduce a nombre base si la normalizada sale de la raíz', () => {
    expect(suitePathFor('../secret/math.test.ts', '/app')).toBe('math.test.ts');
    expect(suitePathFor('src/../../secret/math.test.ts', '/app')).toBe('math.test.ts');
    expect(suitePathFor('/app/src/../../etc/passwd', '/app')).toBe('passwd');
  });

  it('no altera el mensaje de error ni el nombre del caso', () => {
    const raw = JSON.stringify({
      success: false,
      numTotalTests: 1,
      numPassedTests: 0,
      numFailedTests: 1,
      numPendingTests: 0,
      testResults: [
        {
          name: '/app/src/math.test.ts',
          status: 'failed',
          assertionResults: [
            {
              title: 'sub',
              status: 'failed',
              duration: 1,
              failureMessages: ['AssertionError: at /app/src/math.test.ts:4'],
            },
          ],
        },
      ],
    });
    const testCase = parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST', raw, '/app').testCases[0]!;
    expect(testCase.suitePath).toBe('src/math.test.ts');
    expect(testCase.name).toBe('sub');
    expect(testCase.errorMessage).toBe('AssertionError: at /app/src/math.test.ts:4');
  });
});
