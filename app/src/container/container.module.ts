import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContainerRunner } from './container-runner.service.js';
import { DOCKER_CLIENT, dockerClientFactory } from './docker-client.provider.js';
import { OrphanContainerReconciler } from './orphan-container-reconciler.service.js';

@Module({
  providers: [
    {
      provide: DOCKER_CLIENT,
      useFactory: dockerClientFactory,
      inject: [ConfigService],
    },
    ContainerRunner,
    OrphanContainerReconciler,
  ],
  exports: [ContainerRunner, DOCKER_CLIENT],
})
export class ContainerModule {}
