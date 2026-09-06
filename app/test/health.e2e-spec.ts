import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter.js';

describe('Health API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SANDBOX_SERVICE_TOKEN = 'health-e2e-token';
    process.env.SANDBOX_ALLOWED_DOWNLOAD_HOSTS = 'storage.example.com';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
