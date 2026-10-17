import type {
  ExecutionProfile,
  RunnerFacts,
  TestCaseFact,
  TestCaseFactStatus,
  TestCaseFailureKind,
  TestRunner,
} from '../common/contracts/sandbox-execution.contract.js';
import { InvalidArchiveError } from '../common/errors/sandbox-fact-error.js';
import { MAX_TEST_CASES } from './runner-result-limits.js';

interface JestCompatibleAssertion {
  title: string;
  status: string;
  duration?: number | null;
  failureMessages?: string[];
  /** Solo Jest: objetos de error; los de `expect` traen `matcherResult`. */
  failureDetails?: unknown[];
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
  executionProfile: ExecutionProfile,
  runner: TestRunner,
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
      const status = mapAssertionStatus(assertion.status);
      testCases.push({
        suitePath: suite.name ?? null,
        name: assertion.title,
        status,
        durationMs:
          typeof assertion.duration === 'number'
            ? Math.round(assertion.duration)
            : null,
        errorMessage: assertion.failureMessages?.[0] ?? null,
        failureKind: status === 'FAILED' ? classifyFailure(assertion) : null,
      });
    }
    if (truncated) {
      break;
    }
  }

  return {
    executionProfile,
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

/**
 * Jest marca los fallos de `expect` con `failureDetails[].matcherResult` y su
 * mensaje empieza por `Error: expect(`; Vitest (chai) por `AssertionError`.
 * Todo lo demás (TypeError, ReferenceError, excepción propia) es `ERROR`.
 */
function classifyFailure(
  assertion: JestCompatibleAssertion,
): TestCaseFailureKind {
  const hasMatcherResult = (assertion.failureDetails ?? []).some(
    (detail) =>
      typeof detail === 'object' &&
      detail !== null &&
      'matcherResult' in detail,
  );
  const message = assertion.failureMessages?.[0] ?? '';
  if (
    hasMatcherResult ||
    message.startsWith('Error: expect(') ||
    message.startsWith('AssertionError')
  ) {
    return 'ASSERTION';
  }
  return 'ERROR';
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
