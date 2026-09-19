import { Injectable } from '@nestjs/common';
import type { RunnerFacts } from '../common/contracts/sandbox-execution.contract.js';
import { hasAnyConfigFile } from './project-config-detection.js';
import {
  declaresComposerDependency,
  readComposerJson,
} from './php-project-config-detection.js';
import { parsePhpunitJunitXml } from './phpunit-junit-result-parser.js';
import type {
  ProjectRunnerContext,
  TestRunnerAdapter,
} from './test-runner-adapter.js';

const CONFIG_FILE_NAMES = ['phpunit.xml', 'phpunit.xml.dist'];

@Injectable()
export class PhpunitTestRunnerAdapter implements TestRunnerAdapter {
  readonly executionProfile = 'PHP_LARAVEL_PHPUNIT' as const;
  readonly runner = 'PHPUNIT' as const;

  async supports(context: ProjectRunnerContext): Promise<boolean> {
    const composerJson = await readComposerJson(context.workspacePath);
    if (declaresComposerDependency(composerJson, 'phpunit/phpunit')) {
      return true;
    }
    return hasAnyConfigFile(context.workspacePath, CONFIG_FILE_NAMES);
  }

  buildCommand(context: ProjectRunnerContext): string[] {
    return ['php', 'vendor/bin/phpunit', '--log-junit', context.resultsFilePath];
  }

  parseResult(rawOutput: string): RunnerFacts {
    return parsePhpunitJunitXml(rawOutput);
  }
}
