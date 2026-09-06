import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';
import {
  EXECUTION_REPOSITORY,
  InMemoryExecutionRepository,
} from './execution.repository.js';

@Module({
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    { provide: EXECUTION_REPOSITORY, useClass: InMemoryExecutionRepository },
  ],
})
export class ExecutionsModule {}
