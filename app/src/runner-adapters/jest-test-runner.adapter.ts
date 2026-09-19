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
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.cjs',
  'jest.config.json',
];

@Injectable()
export class JestTestRunnerAdapter implements TestRunnerAdapter {
  readonly executionProfile = 'NODE_TYPESCRIPT' as const;
  readonly runner = 'JEST' as const;

  async supports(context: ProjectRunnerContext): Promise<boolean> {
    const packageJson = await readPackageJson(context.workspacePath);
    if (declaresDependency(packageJson, 'jest')) {
      return true;
    }
    if (packageJson && 'jest' in packageJson) {
      return true;
    }
    return hasAnyConfigFile(context.workspacePath, CONFIG_FILE_NAMES);
  }

  buildCommand(context: ProjectRunnerContext): string[] {
    return [
      'node_modules/.bin/jest',
      '--ci',
      '--json',
      `--outputFile=${context.resultsFilePath}`,
    ];
  }

  parseResult(rawOutput: string): RunnerFacts {
    return parseJestCompatibleJson('NODE_TYPESCRIPT', 'JEST', rawOutput);
  }
}
