import { XMLParser } from 'fast-xml-parser';
import type {
  RunnerFacts,
  TestCaseFact,
  TestCaseFactStatus,
} from '../common/contracts/sandbox-execution.contract.js';
import { InvalidArchiveError } from '../common/errors/sandbox-fact-error.js';
import { MAX_TEST_CASES } from './runner-result-limits.js';

interface JunitTestCase {
  name?: string;
  classname?: string;
  time?: string;
  failure?: { '#text'?: string; message?: string } | string;
  error?: { '#text'?: string; message?: string } | string;
  skipped?: unknown;
}

interface JunitTestSuite {
  name?: string;
  testsuite?: JunitTestSuite[];
  testcase?: JunitTestCase[];
}

interface JunitReport {
  testsuites?: { testsuite?: JunitTestSuite[] };
  testsuite?: JunitTestSuite[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

/**
 * PHPUnit no tiene un reporter JSON estándar como Jest/Vitest; el formato
 * universal es JUnit XML (`--log-junit`). No hay distinción compilado vs.
 * ejecutado en PHPUnit: si el reporte se pudo generar y parsear, los tests
 * se ejecutaron (un fallo fatal antes de correr ningún test nunca produce
 * el archivo — ya cubierto genéricamente como `TestExecutionFailedError`
 * en `execution-pipeline.service.ts` cuando el archivo no existe).
 */
export function parsePhpunitJunitXml(rawOutput: string): RunnerFacts {
  let report: JunitReport;
  try {
    report = parser.parse(rawOutput) as JunitReport;
  } catch (error) {
    throw new InvalidArchiveError(
      `runner output is not valid JUnit XML: ${(error as Error).message}`,
    );
  }

  const rootSuites = report.testsuites?.testsuite ?? report.testsuite ?? [];
  const testCases: TestCaseFact[] = [];
  let truncated = false;

  collectTestCases(rootSuites, testCases, () => {
    truncated = true;
  });

  const totalTests = testCases.length;
  const failedTests = testCases.filter((tc) => tc.status === 'FAILED').length;
  const skippedTests = testCases.filter(
    (tc) => tc.status === 'SKIPPED' || tc.status === 'TODO',
  ).length;
  const passedTests = totalTests - failedTests - skippedTests;
  const executed = totalTests > 0;

  return {
    executionProfile: 'PHP_LARAVEL_PHPUNIT',
    runner: 'PHPUNIT',
    compiled: executed,
    executed,
    passed: executed && failedTests === 0,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    testCases,
    testCasesTruncated: truncated,
  };
}

function collectTestCases(
  suites: JunitTestSuite[],
  out: TestCaseFact[],
  onTruncated: () => void,
): void {
  for (const suite of suites) {
    if (suite.testsuite?.length) {
      collectTestCases(suite.testsuite, out, onTruncated);
    }
    for (const testcase of suite.testcase ?? []) {
      if (out.length >= MAX_TEST_CASES) {
        onTruncated();
        return;
      }
      out.push({
        suitePath: suite.name ?? null,
        name: testcase.name ?? 'unknown',
        status: mapTestCaseStatus(testcase),
        durationMs:
          testcase.time !== undefined
            ? Math.round(Number.parseFloat(testcase.time) * 1000)
            : null,
        errorMessage: extractMessage(testcase),
      });
    }
  }
}

function mapTestCaseStatus(testcase: JunitTestCase): TestCaseFactStatus {
  if (testcase.failure !== undefined || testcase.error !== undefined) {
    return 'FAILED';
  }
  if (testcase.skipped !== undefined) {
    return 'SKIPPED';
  }
  return 'PASSED';
}

function extractMessage(testcase: JunitTestCase): string | null {
  const node = testcase.failure ?? testcase.error;
  if (node === undefined) {
    return null;
  }
  if (typeof node === 'string') {
    return node || null;
  }
  return node.message ?? node['#text'] ?? null;
}
