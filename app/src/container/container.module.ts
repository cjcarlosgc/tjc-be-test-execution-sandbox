import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContainerRunner } from './container-runner.service.js';
import { DOCKER_CLIENT, dockerClientFactory } from './docker-client.provider.js';

@Module({
  providers: [
    {
      provide: DOCKER_CLIENT,
      useFactory: dockerClientFactory,
      inject: [ConfigService],
    },
    ContainerRunner,
  ],
  exports: [ContainerRunner],
})
export class ContainerModule {}
