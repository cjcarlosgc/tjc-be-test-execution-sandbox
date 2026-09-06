import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { Agent, fetch as undiciFetch } from 'undici';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter.js';
import {
  FETCH_CLIENT,
  type FetchLike,
} from '../src/workspace/execution-input-download.service.js';
import { startFixtureServer, type FixtureServer } from './support/https-fixture-server.js';
import { buildZipFixture } from './support/zip-fixture.js';

const SERVICE_TOKEN = 'e2e-service-token';

/** El servidor fixture usa un certificado autofirmado; solo el fetch de test lo confía. */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const insecureFetch: FetchLike = ((input, init) =>
  undiciFetch(input as never, {
    ...(init as Record<string, unknown>),
    dispatcher: insecureAgent,
  } as never)) as unknown as FetchLike;

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

async function waitForFile(filePath: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for file ${filePath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

async function pollExecutionStatus(
  app: INestApplication,
  executionId: string,
  predicate: (status: string) => boolean,
  timeoutMs = 3000,
): Promise<{ status: string; stage: string | null }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await request(app.getHttpServer())
      .get(`/executions/${executionId}`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    if (predicate(response.body.status)) {
      return { status: response.body.status, stage: response.body.stage };
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for execution ${executionId}, last status=${response.body.status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('Executions API (e2e)', () => {
  let app: INestApplication;
  let workspaceRoot: string;
  let fixtureServer: FixtureServer;
  let snapshotSha256: string;
  let snapshotZip: Buffer;
  let artifactSha256: string;
  const snapshotContent = { 'package.json': '{"name":"fixture-project"}' };
  const artifactContent = 'export const generated = true;\n';

  beforeAll(async () => {
    process.env.SANDBOX_SERVICE_TOKEN = SERVICE_TOKEN;
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sandbox-e2e-workspace-'),
    );
    process.env.SANDBOX_WORKSPACE_ROOT = workspaceRoot;

    snapshotZip = await buildZipFixture(snapshotContent);
    snapshotSha256 = createHash('sha256').update(snapshotZip).digest('hex');
    const artifactBuffer = Buffer.from(artifactContent, 'utf8');
    artifactSha256 = createHash('sha256').update(artifactBuffer).digest('hex');

    fixtureServer = await startFixtureServer({
      '/snapshot.zip': () => snapshotZip,
      '/artifact.ts': () => artifactBuffer,
    });
    process.env.SANDBOX_ALLOWED_DOWNLOAD_HOSTS = fixtureServer.host;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FETCH_CLIENT)
      .useValue(insecureFetch)
      .compile();

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
    await fixtureServer.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
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

  it('accepts a request and echoes the correlation id immediately', async () => {
    const correlationId = 'corr-abc-123';
    const accepted = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '55555555-5555-4555-8555-555555555555')
      .set('x-correlation-id', correlationId)
      .send(
        validExecutionPayload({
          requestId: '55555555-5555-4555-8555-555555555555',
        }),
      );

    expect(accepted.status).toBe(202);
    expect(accepted.headers['x-correlation-id']).toBe(correlationId);
    expect(accepted.body.status).toBe('PENDING');
    expect(accepted.body.executionId).toBeTruthy();
  });

  it('fails with a factual result when the snapshot host is not allowed', async () => {
    const accepted = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '66666666-6666-4666-8666-666666666666')
      .send(
        validExecutionPayload({
          requestId: '66666666-6666-4666-8666-666666666666',
        }),
      );
    expect(accepted.status).toBe(202);
    const executionId = accepted.body.executionId;

    await pollExecutionStatus(app, executionId, (status) => status === 'FAILED');

    const result = await request(app.getHttpServer())
      .get(`/executions/${executionId}/result`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(result.status).toBe(200);
    expect(result.body.status).toBe('FAILED');
    expect(result.body.failure.code).toBe('INPUT_DOWNLOAD_FAILED');
    expect(result.body.failure.category).toBe('CONFIGURATION');
    expect(result.body.failure.stage).toBe('PREPARING');
  });

  it('downloads a real snapshot over HTTPS, extracts it and materializes an artifact', async () => {
    const accepted = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', '77777777-7777-4777-8777-777777777777')
      .send(
        validExecutionPayload({
          requestId: '77777777-7777-4777-8777-777777777777',
          snapshot: {
            role: 'PROJECT_SNAPSHOT',
            url: `${fixtureServer.baseUrl}/snapshot.zip`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            sha256: snapshotSha256,
            sizeBytes: snapshotZip.length,
          },
          artifacts: [
            {
              artifactId: '88888888-8888-4888-8888-888888888888',
              relativePath: 'src/generated.spec.ts',
              artifactType: 'CREATED',
              download: {
                role: 'GENERATED_ARTIFACT',
                url: `${fixtureServer.baseUrl}/artifact.ts`,
                expiresAt: '2099-01-01T00:00:00.000Z',
                sha256: artifactSha256,
                sizeBytes: Buffer.byteLength(artifactContent),
              },
            },
          ],
        }),
      );

    expect(accepted.status).toBe(202);
    const executionId = accepted.body.executionId;
    const workspacePath = path.join(workspaceRoot, executionId);
    const generatedTestPath = path.join(
      workspacePath,
      'src',
      'generated.spec.ts',
    );

    // El contrato solo expone PENDING/PREPARING (sin distinción de progreso
    // dentro de PREPARING todavía), así que se espera el artefacto final en
    // disco en vez de un estado HTTP intermedio inexistente.
    await waitForFile(generatedTestPath);

    const packageJson = await fs.readFile(
      path.join(workspacePath, 'package.json'),
      'utf8',
    );
    expect(packageJson).toBe(snapshotContent['package.json']);

    const generatedTest = await fs.readFile(generatedTestPath, 'utf8');
    expect(generatedTest).toBe(artifactContent);

    const status = await request(app.getHttpServer())
      .get(`/executions/${executionId}`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    expect(status.body.status).toBe('PREPARING');
    expect(status.body.stage).toBe('PREPARING');
    expect(status.body.failureCode).toBeNull();
  });

  it('returns 404 for an unknown executionId', async () => {
    const response = await request(app.getHttpServer())
      .get('/executions/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('EXECUTION_NOT_FOUND');
  });
});
