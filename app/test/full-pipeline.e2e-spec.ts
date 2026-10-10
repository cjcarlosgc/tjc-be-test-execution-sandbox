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
const PHP_FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'phpunit-sample-project',
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
  let phpProjectZip: Buffer;
  let phpProjectSha256: string;

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

    phpProjectZip = await buildZipFixtureFromDir(PHP_FIXTURE_DIR);
    phpProjectSha256 = createHash('sha256').update(phpProjectZip).digest('hex');

    fixtureServer = await startFixtureServer({
      '/project.zip': () => projectZip,
      '/wrapped-project.zip': () => wrappedProjectZip,
      '/php-project.zip': () => phpProjectZip,
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

  /**
   * Corte 3 de HU43 (009-execution-profiles): `composer install` real (con
   * red, imagen pinneada por `SANDBOX_DEFAULT_PHP_IMAGE`) + PHPUnit real
   * (`--log-junit`) dentro de un container Docker real. Requiere descargar
   * `phpunit/phpunit` de Packagist durante `INSTALLING_DEPENDENCIES`; a
   * diferencia de los casos Node de arriba, esta prueba no se ha corrido
   * aún contra un daemon Docker real (no disponible en el entorno en el que
   * se escribió) — confirmar en un entorno con Docker antes de confiar en
   * que quede en verde.
   */
  it(
    'installs real Composer dependencies and runs real PHPUnit tests, reaching COMPLETED with facts',
    async () => {
      const accepted = await request(app.getHttpServer())
        .post('/executions')
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
        .set('Idempotency-Key', '99999999-9999-4999-8999-999999999999')
        .send({
          requestId: '99999999-9999-4999-8999-999999999999',
          testRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          projectVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          snapshot: {
            role: 'PROJECT_SNAPSHOT',
            url: `${fixtureServer.baseUrl}/php-project.zip`,
            expiresAt: '2099-01-01T00:00:00.000Z',
            sha256: phpProjectSha256,
            sizeBytes: phpProjectZip.length,
          },
          artifacts: [],
          scope: 'BATCH',
          targetIds: [],
          executionProfile: 'PHP_LARAVEL_PHPUNIT',
          runnerHint: 'PHPUNIT',
        });

      expect(accepted.status).toBe(202);
      const executionId = accepted.body.executionId;

      const finalStatus = await pollExecution(app, executionId, 180_000);
      expect(finalStatus.status).toBe('COMPLETED');

      const result = await request(app.getHttpServer())
        .get(`/executions/${executionId}/result`)
        .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('COMPLETED');
      expect(result.body.failure).toBeNull();
      expect(result.body.facts.executionProfile).toBe('PHP_LARAVEL_PHPUNIT');
      expect(result.body.facts.runner).toBe('PHPUNIT');
      expect(result.body.facts.passed).toBe(true);
      expect(result.body.facts.totalTests).toBe(1);
      expect(result.body.facts.testCases[0].name).toBe('testAddWorks');
    },
    210_000,
  );

  /**
   * Corte T-003 de 009: con un artefacto generado, PHPUnit real ejecuta
   * solo ese archivo (no `MathTest` del snapshot), cada caso fallido trae su
   * `failureKind` real y el container de tests recibe el entorno Laravel.
   */
  async function runPhpWithArtifact(
    requestId: string,
    artifactId: string,
    fileName: string,
    content: string,
  ) {
    const buffer = Buffer.from(content, 'utf8');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    fixtureServer.addRoute(`/${fileName}`, () => buffer);

    const accepted = await request(app.getHttpServer())
      .post('/executions')
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
      .set('Idempotency-Key', requestId)
      .send({
        requestId,
        testRunId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        projectVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        snapshot: {
          role: 'PROJECT_SNAPSHOT',
          url: `${fixtureServer.baseUrl}/php-project.zip`,
          expiresAt: '2099-01-01T00:00:00.000Z',
          sha256: phpProjectSha256,
          sizeBytes: phpProjectZip.length,
        },
        artifacts: [
          {
            artifactId,
            relativePath: `tests/Generated/${fileName}`,
            artifactType: 'CREATED',
            download: {
              role: 'GENERATED_ARTIFACT',
              url: `${fixtureServer.baseUrl}/${fileName}`,
              expiresAt: '2099-01-01T00:00:00.000Z',
              sha256,
              sizeBytes: buffer.length,
            },
          },
        ],
        scope: 'BATCH',
        targetIds: [],
        executionProfile: 'PHP_LARAVEL_PHPUNIT',
        runnerHint: 'PHPUNIT',
        phase: 'GENERATED_TESTS',
      });
    expect(accepted.status).toBe(202);
    await pollExecution(app, accepted.body.executionId, 180_000);
    const result = await request(app.getHttpServer())
      .get(`/executions/${accepted.body.executionId}/result`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);
    return result.body;
  }

  it(
    'runs only the generated PHPUnit test, distinguishing ASSERTION from ERROR, with the Laravel testing env',
    async () => {
      const body = await runPhpWithArtifact(
        '12121212-1212-4212-8212-121212121212',
        '13131313-1313-4313-8313-131313131313',
        'GeneratedMathTest.php',
        `<?php

namespace Tests\\Generated;

use App\\Math;
use PHPUnit\\Framework\\TestCase;

final class GeneratedMathTest extends TestCase
{
    public function testLaravelTestingEnvironment(): void
    {
        $this->assertSame('testing', getenv('APP_ENV'));
        $this->assertMatchesRegularExpression('/^base64:.{44}$/', (string) getenv('APP_KEY'));
    }

    public function testAssertionMismatch(): void
    {
        $this->assertSame(999, (new Math())->add(2, 3));
    }

    public function testCallsMissingMethod(): void
    {
        (new Math())->multiply(2, 3);
    }
}
`,
      );

      expect(body.status).toBe('COMPLETED');
      expect(body.failure).toBeNull();
      expect(body.facts.totalTests).toBe(3);
      expect(body.facts.testCases.map((tc: { name: string }) => tc.name)).not.toContain('testAddWorks');
      const kinds = Object.fromEntries(
        body.facts.testCases.map((tc: { name: string; status: string; failureKind: string | null }) => [
          tc.name,
          [tc.status, tc.failureKind],
        ]),
      );
      expect(kinds).toEqual({
        testLaravelTestingEnvironment: ['PASSED', null],
        testAssertionMismatch: ['FAILED', 'ASSERTION'],
        testCallsMissingMethod: ['FAILED', 'ERROR'],
      });
    },
    210_000,
  );

  it(
    'reports TEST_COMPILATION_FAILED when the generated PHPUnit test has a syntax error',
    async () => {
      const body = await runPhpWithArtifact(
        '14141414-1414-4414-8414-141414141414',
        '15151515-1515-4515-8515-151515151515',
        'BrokenTest.php',
        "<?php\nnamespace Tests\\Generated;\nfinal class BrokenTest { public function x( { }\n",
      );

      expect(body.status).toBe('FAILED');
      expect(body.facts).toBeNull();
      expect(body.failure).toMatchObject({
        stage: 'RUNNING_TESTS',
        category: 'COMPILATION',
        code: 'TEST_COMPILATION_FAILED',
      });
    },
    210_000,
  );
});

