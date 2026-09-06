import type {
  RunnerFacts,
  RunnerHint,
  TestCaseFact,
  TestCaseFactStatus,
} from '../common/contracts/sandbox-execution.contract.js';
import { InvalidArchiveError } from '../common/errors/sandbox-fact-error.js';

const MAX_TEST_CASES = 500;

interface JestCompatibleAssertion {
  title: string;
  status: string;
  duration?: number | null;
  failureMessages?: string[];
}

interface JestCompatibleSuite {
  name: string;
  status: string;
  assertionResults: JestCompatibleAssertion[];
}

interface JestCompatibleReport {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  testResults: JestCompatibleSuite[];
}

/**
 * Jest (`--json`) y Vitest (`--reporter=json`) comparten el mismo esquema de
 * reporte (Vitest lo mantiene deliberadamente compatible). Un único parser
 * cubre ambos; "no inferir success solo por texto si existe JSON" (spec).
 */
export function parseJestCompatibleJson(
  runner: RunnerHint,
  rawOutput: string,
): RunnerFacts {
  let report: JestCompatibleReport;
  try {
    report = JSON.parse(rawOutput) as JestCompatibleReport;
  } catch (error) {
    throw new InvalidArchiveError(
      `runner output is not valid JSON: ${(error as Error).message}`,
    );
  }

  const suites = report.testResults ?? [];
  const compiled = suites.every(
    (suite) => suite.assertionResults.length > 0 || suite.status !== 'failed',
  );
  const executed = suites.some((suite) => suite.assertionResults.length > 0);

  const testCases: TestCaseFact[] = [];
  let truncated = false;
  for (const suite of suites) {
    for (const assertion of suite.assertionResults) {
      if (testCases.length >= MAX_TEST_CASES) {
        truncated = true;
        break;
      }
      testCases.push({
        suitePath: suite.name ?? null,
        name: assertion.title,
        status: mapAssertionStatus(assertion.status),
        durationMs:
          typeof assertion.duration === 'number'
            ? Math.round(assertion.duration)
            : null,
        errorMessage: assertion.failureMessages?.[0] ?? null,
      });
    }
    if (truncated) {
      break;
    }
  }

  return {
    runner,
    compiled,
    executed,
    passed: report.success === true,
    totalTests: report.numTotalTests ?? 0,
    passedTests: report.numPassedTests ?? 0,
    failedTests: report.numFailedTests ?? 0,
    skippedTests: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    testCases,
    testCasesTruncated: truncated,
  };
}

function mapAssertionStatus(status: string): TestCaseFactStatus {
  switch (status) {
    case 'passed':
      return 'PASSED';
    case 'pending':
    case 'skipped':
      return 'SKIPPED';
    case 'todo':
      return 'TODO';
    case 'failed':
      return 'FAILED';
    default:
      // Estado desconocido: nunca se trata como éxito silencioso.
      return 'FAILED';
  }
}
