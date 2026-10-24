import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter.js';

describe('Health API (e2e)', () => {
  let app: INestApplication;
  let executionStateDir: string;

  beforeAll(async () => {
    process.env.SANDBOX_SERVICE_TOKEN = 'health-e2e-token';
    process.env.SANDBOX_ALLOWED_DOWNLOAD_HOSTS = 'storage.example.com';
    // Estado de ejecuciones aislado: sin esto, arrancar AppModule crea ~/.tjc-sandbox/executions del usuario.
    executionStateDir = await mkdtemp(join(tmpdir(), 'sandbox-health-state-'));
    process.env.SANDBOX_EXECUTION_STATE_DIR = executionStateDir;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(executionStateDir, { recursive: true, force: true });
  });

  it('GET /health/live never requires auth and always reports ok', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeTruthy();
  });

  it('GET /health/ready does not require auth and reports per-dependency checks', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');

    // El resultado real depende de si Docker está accesible en este entorno;
    // lo relevante es la forma del contrato y que nunca exponga secretos.
    expect([200, 503]).toContain(response.status);
    const checks =
      response.status === 200 ? response.body.checks : response.body.details;
    expect(checks.docker.status).toMatch(/^(ok|unavailable)$/);
    expect(checks.downloadPolicy.status).toBe('ok');
    expect(checks.workspace.status).toMatch(/^(ok|unavailable)$/);
    expect(JSON.stringify(response.body)).not.toContain('storage.example.com');
  });
});
