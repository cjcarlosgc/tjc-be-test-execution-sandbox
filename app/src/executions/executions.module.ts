import { Module } from '@nestjs/common';
import { MaterializationModule } from '../materialization/materialization.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';
import {
  EXECUTION_REPOSITORY,
  InMemoryExecutionRepository,
} from './execution.repository.js';

@Module({
  imports: [WorkspaceModule, MaterializationModule],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionPipelineService,
    { provide: EXECUTION_REPOSITORY, useClass: InMemoryExecutionRepository },
  ],
})
export class ExecutionsModule {}
