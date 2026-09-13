import { Injectable } from '@nestjs/common';
import type { RunnerFacts } from '../common/contracts/sandbox-execution.contract.js';
import { parseJestCompatibleJson } from './jest-compatible-result-parser.js';
import {
  declaresDependency,
  hasAnyConfigFile,
  readPackageJson,
} from './project-config-detection.js';
import type {
  ProjectRunnerContext,
  TestRunnerAdapter,
} from './test-runner-adapter.js';

const CONFIG_FILE_NAMES = [
  'vitest.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
  'vitest.config.cjs',
  'vitest.config.mts',
  'vitest.config.cts',
];

@Injectable()
export class VitestTestRunnerAdapter implements TestRunnerAdapter {
  readonly executionProfile = 'NODE_TYPESCRIPT' as const;
  readonly runner = 'VITEST' as const;

  async supports(context: ProjectRunnerContext): Promise<boolean> {
    const packageJson = await readPackageJson(context.workspacePath);
    if (declaresDependency(packageJson, 'vitest')) {
      return true;
    }
    return hasAnyConfigFile(context.workspacePath, CONFIG_FILE_NAMES);
  }

  buildCommand(context: ProjectRunnerContext): string[] {
    return [
      'node_modules/.bin/vitest',
      'run',
      '--reporter=json',
      `--outputFile=${context.resultsFilePath}`,
    ];
  }

  parseResult(rawOutput: string): RunnerFacts {
    return parseJestCompatibleJson('NODE_TYPESCRIPT', 'VITEST', rawOutput);
  }
}
