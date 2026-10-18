import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { registerProcessSafetyNets } from './common/process-safety.js';
import { HttpExceptionFilter } from './common/http/http-exception.filter.js';

async function bootstrap() {
  if (!process.env.SANDBOX_SERVICE_TOKEN) {
    throw new Error(
      'SANDBOX_SERVICE_TOKEN must be configured before starting the Sandbox service.',
    );
  }

  const app = await NestFactory.create(AppModule);

  // SIGTERM/SIGINT ejecutan onModuleDestroy (barrido de workspaces) en lugar de cortar en seco.
  app.enableShutdownHooks();
  registerProcessSafetyNets(new Logger('Process'), async (exitCode) => {
    await app.close().catch(() => undefined);
    process.exit(exitCode);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Sandbox service listening on port ${port}`, 'Bootstrap');
}

await bootstrap();
