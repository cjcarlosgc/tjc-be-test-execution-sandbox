import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/config/get-number-config.js';
import { ContainerModule } from '../container/container.module.js';
import { MaterializationModule } from '../materialization/materialization.module.js';
import { RunnerAdaptersModule } from '../runner-adapters/runner-adapters.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';
import {
  DEFAULT_RETENTION,
  EXECUTION_REPOSITORY,
  InMemoryExecutionRepository,
} from './execution.repository.js';

@Module({
  imports: [
    WorkspaceModule,
    MaterializationModule,
    RunnerAdaptersModule,
    ContainerModule,
  ],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionPipelineService,
    {
      provide: EXECUTION_REPOSITORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new InMemoryExecutionRepository({
          terminalTtlMs: getNumberConfig(config, 'SANDBOX_EXECUTION_RETENTION_MS', DEFAULT_RETENTION.terminalTtlMs),
          maxTerminalRecords: getNumberConfig(config, 'SANDBOX_EXECUTION_MAX_RETAINED', DEFAULT_RETENTION.maxTerminalRecords),
        }),
    },
  ],
})
export class ExecutionsModule {}
