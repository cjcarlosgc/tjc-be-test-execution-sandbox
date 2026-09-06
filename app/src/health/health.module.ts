import { Module } from '@nestjs/common';
import { ContainerModule } from '../container/container.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [ContainerModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
