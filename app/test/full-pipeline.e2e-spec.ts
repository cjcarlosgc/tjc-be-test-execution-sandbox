import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import Dockerode from 'dockerode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/http/http-exception.filter.js';
import { FETCH_CLIENT, type FetchLike } from '../src/workspace/execution-input-download.service.js';
import { startFixtureServer, type FixtureServer } from './support/https-fixture-server.js';
import { buildZipFixtureFromDir } from './support/zip-fixture.js';
import { insecureFetch } from './support/insecure-fetch.js';

const SERVICE_TOKEN = 'full-pipeline-e2e-token';
const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'vitest-sample-project',
);

async function isDockerAvailable(): Promise<boolean> {
  try {
    await new Dockerode().ping();
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = await isDockerAvailable();

async function pollExecution(
  app: INestApplication,
  executionId: string,
  timeoutMs: number,
): Promise<{ status: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await request(app.getHttpServer())
      .get(`/executions/${executionId}`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    if (response.body.status !== 'PENDING' && !isStageStatus(response.body.status)) {
      return response.body;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for a terminal status, last=${response.body.status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function isStageStatus(status: string): boolean {
  return (
    status === 'PREPARING' ||
    status === 'INSTALLING_DEPENDENCIES' ||
    status === 'RUNNING_TESTS'
  );
}

/**
 * Prueba real de punta a punta: descarga HTTPS real, extracción real,
 * `corepack pnpm install --frozen-lockfile` real (con red) y
 * `vitest run --reporter=json` real dentro de un container Docker real
 * (`DEC-SBX-002`, APROBADO: solo pnpm). Se omite si no hay Docker
 * accesible, para no romper `pnpm test:e2e` en un entorno sin Docker.
 */
describe.skipIf(!dockerAvailable)('Full execution pipeline (e2e real)', () => {
  let app: INestApplication;
  let fixtureServer: FixtureServer;
  let workspaceRoot: string;
  let projectZip: Buffer;
  let projectSha256: string;
  let wrappedProjectZip: Buffer;
  let wrappedProjectSha256: string;

  beforeAll(async () => {
    process.env.SANDBOX_SERVICE_TOKEN = SERVICE_TOKEN;
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sandbox-full-pipeline-'),
    );
    process.env.SANDBOX_WORKSPACE_ROOT = workspaceRoot;

    projectZip = await buildZipFixtureFromDir(FIXTURE_DIR);
    projectSha256 = createHash('sha256').update(projectZip).digest('hex');

    // Mismo proyecto, envuelto en una única carpeta contenedora de nivel
    // superior (patrón real de exports de GitHub) — prueba que
    // `resolveProjectRoot` + el `workingDir` del container encuentran y
    // ejecutan el proyecto real dentro del container, con Docker real.
    wrappedProjectZip = await buildZipFixtureFromDir(FIXTURE_DIR, {
      wrapInFolder: 'my-project',
    });
    wrappedProjectSha256 = createHash('sha256')
      .update(wrappedProjectZip)
      .digest('hex');

    fixtureServer = await startFixtureServer({
      '/project.zip': () => projectZip,
      '/wrapped-project.zip': () => wrappedProjectZip,
    });
    process.env.SANDBOX_ALLOWED_DOWNLOAD_HOSTS = fixtureServer.host;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FETCH_CLIENT)
      .useValue(insecureFetch as FetchLike)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await fixtureServer.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it(
    'installs real dependencies and runs real Vitest tests, reaching COMPLETED with facts',
    async () => {
      const accepted = await request(app.getHttpServer())
        .post('/executions')
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
        .set('Idempotency-Key', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
        .send({
          requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          testRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          projectVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          snapshot: {
            role: 'PROJECT_SNAPSHOT',
            url: `${fixtureServer.baseUrl}/project.zip`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            sha256: projectSha256,
            sizeBytes: projectZip.length,
          },
          artifacts: [],
          scope: 'BATCH',
          targetIds: [],
          executionProfile: 'NODE_TYPESCRIPT',
          runnerHint: 'VITEST',
        });

      expect(accepted.status).toBe(202);
      const executionId = accepted.body.executionId;

      const finalStatus = await pollExecution(app, executionId, 120_000);
      expect(finalStatus.status).toBe('COMPLETED');

      const result = await request(app.getHttpServer())
        .get(`/executions/${executionId}/result`)
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('COMPLETED');
      expect(result.body.failure).toBeNull();
      expect(result.body.facts.runner).toBe('VITEST');
      expect(result.body.facts.compiled).toBe(true);
      expect(result.body.facts.executed).toBe(true);
      expect(result.body.facts.passed).toBe(true);
      expect(result.body.facts.totalTests).toBe(1);
      expect(result.body.facts.passedTests).toBe(1);
      expect(result.body.facts.testCases[0].name).toBe('adds two numbers');
      expect(result.body.stageDurations.map((d: { stage: string }) => d.stage)).toEqual([
        'PREPARING',
        'INSTALLING_DEPENDENCIES',
        'RUNNING_TESTS',
      ]);
      expect(
        result.body.evidence.some((e: { kind: string }) => e.kind === 'RUNNER_REPORT'),
      ).toBe(true);
    },
    150_000,
  );

  it(
    'completes with facts.passed=false when a materialized artifact makes a real test fail',
    async () => {
      const failingTest = `import { describe, expect, it } from 'vitest';
import { add } from './math.js';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(999);
  });
});
`;
      const failingBuffer = Buffer.from(failingTest, 'utf8');
      const failingSha256 = createHash('sha256').update(failingBuffer).digest('hex');
      fixtureServer.addRoute('/failing-math.test.ts', () => failingBuffer);

      const accepted = await request(app.getHttpServer())
        .post('/executions')
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
        .set('Idempotency-Key', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
        .send({
          requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          testRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          projectVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          snapshot: {
            role: 'PROJECT_SNAPSHOT',
            url: `${fixtureServer.baseUrl}/project.zip`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            sha256: projectSha256,
            sizeBytes: projectZip.length,
          },
          artifacts: [
            {
              artifactId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              relativePath: 'src/math.test.ts',
              artifactType: 'MODIFIED',
              download: {
                role: 'GENERATED_ARTIFACT',
                url: `${fixtureServer.baseUrl}/failing-math.test.ts`,
                expiresAt: '2099-01-01T00:00:00.000Z',
                sha256: failingSha256,
                sizeBytes: failingBuffer.length,
              },
            },
          ],
          scope: 'BATCH',
          targetIds: [],
          executionProfile: 'NODE_TYPESCRIPT',
          runnerHint: 'VITEST',
        });

      expect(accepted.status).toBe(202);
      const executionId = accepted.body.executionId;

      const finalStatus = await pollExecution(app, executionId, 120_000);
      expect(finalStatus.status).toBe('COMPLETED');

      const result = await request(app.getHttpServer())
        .get(`/executions/${executionId}/result`)
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

      expect(result.body.status).toBe('COMPLETED');
      expect(result.body.failure).toBeNull();
      expect(result.body.facts.passed).toBe(false);
      expect(result.body.facts.failedTests).toBe(1);
      expect(result.body.appliedArtifactIds).toEqual([
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ]);
    },
    150_000,
  );

  it(
    'installs and runs the real project when the snapshot is wrapped in a single top-level folder (Docker real)',
    async () => {
      const accepted = await request(app.getHttpServer())
        .post('/executions')
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
        .set('Idempotency-Key', 'ffffffff-ffff-4fff-8fff-ffffffffffff')
        .send({
          requestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          testRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          projectVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          snapshot: {
            role: 'PROJECT_SNAPSHOT',
            url: `${fixtureServer.baseUrl}/wrapped-project.zip`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            sha256: wrappedProjectSha256,
            sizeBytes: wrappedProjectZip.length,
          },
          artifacts: [],
          scope: 'BATCH',
          targetIds: [],
          executionProfile: 'NODE_TYPESCRIPT',
          runnerHint: 'VITEST',
        });

      expect(accepted.status).toBe(202);
      const executionId = accepted.body.executionId;

      const finalStatus = await pollExecution(app, executionId, 120_000);
      expect(finalStatus.status).toBe('COMPLETED');

      const result = await request(app.getHttpServer())
        .get(`/executions/${executionId}/result`)
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('COMPLETED');
      expect(result.body.failure).toBeNull();
      expect(result.body.facts.runner).toBe('VITEST');
      expect(result.body.facts.passed).toBe(true);
      expect(result.body.facts.totalTests).toBe(1);
    },
    150_000,
  );
});
