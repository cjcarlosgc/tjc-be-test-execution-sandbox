import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter.js';

const SERVICE_TOKEN = 'e2e-service-token';

function validExecutionPayload(overrides: Record<string, unknown> = {}) {
  return {
    requestId: '11111111-1111-4111-8111-111111111111',
    testRunId: '22222222-2222-4222-8222-222222222222',
    projectVersionId: '33333333-3333-4333-8333-333333333333',
    snapshot: {
      role: 'PROJECT_SNAPSHOT',
      url: 'https://storage.example.com/snapshot.zip?sig=abc',
      expiresAt: '2026-09-06T01:00:00.000Z',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    },
    artifacts: [],
    scope: 'BATCH',
    targetIds: [],
    runnerHint: 'VITEST',
    ...overrides,
  };
}

describe('Executions API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SANDBOX_SERVICE_TOKEN = SERVICE_TOKEN;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(app.getHttpServer())
      .post('/executions')
      .set('Idempotency-Key', '11111111-1111-4111-8111-111111111111')
      .send(validExecutionPayload());

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('rejects requests missing the Idempotency-Key header', async () => {
    const response = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .send(validExecutionPayload());

    expect(response.status).toBe(400);
  });

  it('rejects unknown fields in the request body', async () => {
    const response = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '11111111-1111-4111-8111-111111111111')
      .send(validExecutionPayload({ strategy: 'RAG' }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a traversal path in an artifact relativePath', async () => {
    const response = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '11111111-1111-4111-8111-111111111111')
      .send(
        validExecutionPayload({
          artifacts: [
            {
              artifactId: '44444444-4444-4444-8444-444444444444',
              relativePath: '../../etc/passwd',
              artifactType: 'CREATED',
              download: {
                role: 'GENERATED_ARTIFACT',
                url: 'https://storage.example.com/artifact.ts',
                expiresAt: '2026-09-06T01:00:00.000Z',
                sha256: 'b'.repeat(64),
                sizeBytes: 128,
              },
            },
          ],
        }),
      );

    expect(response.status).toBe(400);
  });

  it('accepts a valid request, echoes correlation id and supports polling', async () => {
    const correlationId = 'corr-abc-123';
    const accepted = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '55555555-5555-4555-8555-555555555555')
      .set('x-correlation-id', correlationId)
      .send(validExecutionPayload({ requestId: '55555555-5555-4555-8555-555555555555' }));

    expect(accepted.status).toBe(202);
    expect(accepted.headers['x-correlation-id']).toBe(correlationId);
    expect(accepted.body.status).toBe('PENDING');
    expect(accepted.body.executionId).toBeTruthy();

    const executionId = accepted.body.executionId;

    const status = await request(app.getHttpServer())
      .get(`/executions/${executionId}`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('PENDING');

    const result = await request(app.getHttpServer())
      .get(`/executions/${executionId}/result`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('EXECUTION_NOT_FINISHED');
  });

  it('returns 404 for an unknown executionId', async () => {
    const response = await request(app.getHttpServer())
      .get('/executions/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('EXECUTION_NOT_FOUND');
  });
});
