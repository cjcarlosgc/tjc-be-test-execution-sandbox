import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import { BearerAuthGuard } from '../common/auth/bearer-auth.guard.js';
import { CorrelationIdMiddleware } from '../common/http/correlation-id.middleware.js';
import { HttpExceptionFilter } from '../common/http/http-exception.filter.js';
import {
  ImageUnavailableError,
  InputDownloadFailedError,
} from '../common/errors/sandbox-fact-error.js';
import type {
  ContainerRunner,
  ContainerRunResult,
} from '../container/container-runner.service.js';
import { validateContract } from '../contracts/contract-validator.js';
import { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import { JestTestRunnerAdapter } from '../runner-adapters/jest-test-runner.adapter.js';
import { PhpunitTestRunnerAdapter } from '../runner-adapters/phpunit-test-runner.adapter.js';
import { RunnerAdapterRegistry } from '../runner-adapters/runner-adapter-registry.js';
import { VitestTestRunnerAdapter } from '../runner-adapters/vitest-test-runner.adapter.js';
import type { ExecutionInputDownloadService } from '../workspace/execution-input-download.service.js';
import { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import {
  EXECUTION_REPOSITORY,
  InMemoryExecutionRepository,
} from './execution.repository.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';

/*
 * Contrato Core ↔ Sandbox sobre resultados REALES del ExecutionPipelineService (evidencia CT-06 / CT-07).
 *
 * Real: HTTP (Nest, guard de Bearer, ValidationPipe, HttpExceptionFilter), ExecutionsService, ExecutionPipelineService,
 * ArtifactMaterializer, SafeArchiveExtractor, WorkspaceManager (salvo creación/limpieza de directorios), RunnerAdapterRegistry
 * con los adapters Jest/Vitest/PHPUnit y sus parsers, y la validación contra spec/contracts/schemas.
 * Fakes en los bordes: el contenedor (ContainerRunner: instalación y ejecución de tests), las descargas de snapshot y
 * artefactos (ExecutionInputDownloadService) y la creación de workspace. La salida del runner son fixtures reales de
 * Jest/Vitest (JSON) y PHPUnit (JUnit XML) de src/runner-adapters/fixtures.
 */

const SCHEMA = 'sandbox-execution.schema.json' as const;
const ENVELOPE = 'error-envelope.schema.json' as const;
const TOKEN = 'contract-real-test-token';
const auth = { Authorization: `Bearer ${TOKEN}` };
const TERMINAL = ['COMPLETED', 'FAILED', 'TIMED_OUT'];

const FIXTURES = resolve(__dirname, '../runner-adapters/fixtures');
const EXAMPLES = resolve(__dirname, '../../../spec/contracts/schemas/examples');
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');
const example = <T = Record<string, any>>(name: string): T =>
  JSON.parse(readFileSync(resolve(EXAMPLES, name), 'utf8')) as T;

const SNAPSHOT_URL = 'https://storage.example.test/snapshot.zip?sig=EXAMPLE';
const EXAMPLE_ARTIFACT_URL = 'https://storage.example.test/foo.spec.ts?sig=EXAMPLE';

const NODE_PROJECT: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'demo', devDependencies: { vitest: '^3.0.0' } }),
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'src/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
};
const PHP_PROJECT: Record<string, string> = {
  'composer.json': JSON.stringify({ 'require-dev': { 'phpunit/phpunit': '^11.0' } }),
  'apps/api/composer.json': JSON.stringify({ 'require-dev': { 'phpunit/phpunit': '^11.0' } }),
};

interface ContainerScript {
  /** Si se define, la instalación espera a esta promesa (para observar estados intermedios). */
  gate?: Promise<void>;
  installError?: Error;
  install: Partial<ContainerRunResult>;
  testError?: Error;
  test: Partial<ContainerRunResult>;
  /** Contenido que el runner escribe en `.sandbox-results.json`; undefined = no escribe reporte. */
  report?: string;
}

interface Sandbox {
  app: INestApplication;
  repository: InMemoryExecutionRepository;
  script: ContainerScript;
  /** Comando que el pipeline pasó al contenedor en cada ejecución de tests. */
  commands: string[][];
  serve(url: string, body: Buffer | string): void;
  artifact(relativePath: string, content: string): Record<string, unknown>;
  close(): Promise<void>;
}

const open: Sandbox[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((sandbox) => sandbox.close()));
});

function okContainerResult(overrides: Partial<ContainerRunResult> = {}): ContainerRunResult {
  return {
    exitCode: 0,
    oomKilled: false,
    stdout: '',
    stdoutTruncated: false,
    stdoutOriginalBytes: 0,
    stderr: '',
    stderrTruncated: false,
    stderrOriginalBytes: 0,
    timedOut: false,
    durationMs: 1,
    ...overrides,
  };
}

function zip(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolveZip, reject) => {
    const archive = new ZipFile();
    for (const [entryPath, content] of Object.entries(files)) {
      archive.addBuffer(Buffer.from(content, 'utf8'), entryPath);
    }
    const chunks: Buffer[] = [];
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('end', () => resolveZip(Buffer.concat(chunks)));
    archive.outputStream.on('error', reject);
    archive.end();
  });
}

async function startSandbox(): Promise<Sandbox> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-real-'));
  const overrides: Record<string, unknown> = {
    SANDBOX_SERVICE_TOKEN: TOKEN,
    SANDBOX_WORKSPACE_ROOT: root,
  };
  const config = {
    get: (key: string, fallback?: unknown) => (key in overrides ? overrides[key] : fallback),
  } as unknown as ConfigService;

  const objects = new Map<string, Buffer>();
  const script: ContainerScript = { install: {}, test: {} };
  const commands: string[][] = [];

  // Borde de descargas: sirve bytes por URL; el extractor y el materializador reales hacen el resto.
  const downloads = {
    downloadToFile: async (ref: { url: string; role: string }, destinationPath: string) => {
      const body = objects.get(ref.url);
      if (body === undefined) {
        throw new InputDownloadFailedError(`no object served for ${ref.role}`);
      }
      await fs.writeFile(destinationPath, body);
      return { path: destinationPath, sizeBytes: body.length, sha256: 'x' };
    },
  } as unknown as ExecutionInputDownloadService;

  // Borde de workspace: directorios planos (sin ACL de Linux); el resto de WorkspaceManager es real.
  const realWorkspaces = new WorkspaceManager(config);
  const workspaces = Object.assign(Object.create(realWorkspaces) as WorkspaceManager, {
    createWorkspace: async (executionId: string) => {
      const dir = path.join(root, executionId);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },
    cleanup: async (dir: string) => {
      await fs.rm(dir, { recursive: true, force: true });
      return true;
    },
  });

  // Borde de contenedor: simula instalación y ejecución; escribe el reporte del runner en la ruta montada.
  const containerRunner = {
    installDependencies: async () => {
      if (script.gate) await script.gate;
      if (script.installError) throw script.installError;
      return okContainerResult(script.install);
    },
    runTestCommand: async (_executionId: string, workspacePath: string, command: string[]) => {
      commands.push(command);
      if (script.testError) throw script.testError;
      if (script.report !== undefined) {
        await fs.writeFile(path.join(workspacePath, '.sandbox-results.json'), script.report, 'utf8');
      }
      return okContainerResult(script.test);
    },
    restorePhpWorkspaceAccess: async () => undefined,
  } as unknown as ContainerRunner;

  const repository = new InMemoryExecutionRepository();
  const pipeline = new ExecutionPipelineService(
    repository,
    workspaces,
    new SafeArchiveExtractor(config),
    downloads,
    new ArtifactMaterializer(workspaces, downloads),
    new RunnerAdapterRegistry(
      new JestTestRunnerAdapter(),
      new VitestTestRunnerAdapter(),
      new PhpunitTestRunnerAdapter(),
    ),
    containerRunner,
    config,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [ExecutionsController],
    providers: [
      ExecutionsService,
      BearerAuthGuard,
      { provide: EXECUTION_REPOSITORY, useValue: repository },
      { provide: ExecutionPipelineService, useValue: pipeline },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use((req: any, res: any, next: any) => new CorrelationIdMiddleware().use(req, res, next));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const serve = (url: string, body: Buffer | string) => {
    objects.set(url, Buffer.from(body));
  };
  const sandbox: Sandbox = {
    app,
    repository,
    script,
    commands,
    serve,
    artifact(relativePath, content) {
      const artifactId = randomUUID();
      const url = `https://storage.example.test/artifacts/${artifactId}?sig=EXAMPLE`;
      serve(url, content);
      return {
        artifactId,
        relativePath,
        artifactType: 'CREATED',
        download: {
          role: 'GENERATED_ARTIFACT',
          url,
          expiresAt: '2099-01-01T00:00:00.000Z',
          sha256: 'b'.repeat(64),
          sizeBytes: Buffer.byteLength(content),
        },
      };
    },
    async close() {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
  // Por defecto, el ejemplo canónico de artefacto y el proyecto Node del snapshot.
  serve(EXAMPLE_ARTIFACT_URL, 'export {};\n');
  serve(SNAPSHOT_URL, await zip(NODE_PROJECT));
  open.push(sandbox);
  return sandbox;
}

const post = (sandbox: Sandbox, body: Record<string, unknown>, idempotencyKey?: string) =>
  request(sandbox.app.getHttpServer())
    .post('/executions')
    .set(auth)
    .set('Idempotency-Key', idempotencyKey ?? (body.requestId as string))
    .send(body);

const get = (sandbox: Sandbox, route: string) =>
  request(sandbox.app.getHttpServer()).get(route).set(auth);

/** Consulta el estado por HTTP hasta un estado terminal (el POST lanza el pipeline sin esperar). */
async function finish(sandbox: Sandbox, executionId: string) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const response = await get(sandbox, `/executions/${executionId}`);
    if (TERMINAL.includes(response.body.status)) return response;
    if (Date.now() > deadline) {
      throw new Error(`execution ${executionId} did not finish (last status ${response.body.status})`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
}

async function runToResult(sandbox: Sandbox, body: Record<string, unknown>) {
  const accepted = await post(sandbox, body);
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
  await finish(sandbox, accepted.body.executionId);
  const result = await get(sandbox, `/executions/${accepted.body.executionId}/result`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return { executionId: accepted.body.executionId as string, result: result.body };
}

const envelopeErrors = (body: unknown) => validateContract(ENVELOPE, null, body).errors;
const schemaErrors = (definition: string, body: unknown) =>
  validateContract(SCHEMA, definition, body).errors;

const nodeRequest = (overrides: Record<string, unknown> = {}) => ({
  ...example('sandbox-create-request.node.json'),
  ...overrides,
});
const phpRequest = (overrides: Record<string, unknown> = {}) => ({
  ...example('sandbox-create-request.php.json'),
  ...overrides,
});

describe('C-06 Execution Coordinator → Sandbox', () => {
  it('T4: POST sin phase de extremo a extremo; la fase efectiva es GENERATED_TESTS y solo corre el artefacto', async () => {
    const sandbox = await startSandbox();
    const { phase: _omitted, ...body } = nodeRequest();
    sandbox.script.report = fixture('vitest-passing.json');

    const accepted = await post(sandbox, body);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
    expect(schemaErrors('SandboxExecutionAcceptedResponse', accepted.body)).toEqual([]);

    const status = await finish(sandbox, accepted.body.executionId);
    expect(status.status).toBe(200);
    expect(schemaErrors('SandboxExecutionStatusResponse', status.body)).toEqual([]);
    expect(status.body.status).toBe('COMPLETED');

    // Observable en el contenedor: con GENERATED_TESTS el comando recibe la ruta del artefacto.
    expect(sandbox.commands).toHaveLength(1);
    expect(sandbox.commands[0]!.at(-1)).toBe('src/foo.spec.ts');

    const result = await get(sandbox, `/executions/${accepted.body.executionId}/result`);
    expect(result.body.appliedArtifactIds).toEqual([body.artifacts[0].artifactId]);
    expect(schemaErrors('SandboxExecutionResultResponse', result.body)).toEqual([]);
  });

  it('T5: phase=BASELINE con artifacts → 400 con ErrorEnvelope válido (refuerza la regla de executions.service.spec «rejects BASELINE with artifacts» a nivel HTTP)', async () => {
    const sandbox = await startSandbox();
    const body = phpRequest({
      artifacts: [sandbox.artifact('tests/Unit/MathTest.php', '<?php')],
    });

    const response = await post(sandbox, body);

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(envelopeErrors(response.body)).toEqual([]);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toContain('phase=BASELINE does not accept artifacts');
    expect(sandbox.repository.findByRequestId(body.requestId)).toBeNull();
  });

  it('T6: misma carga con phase distinta y mismo requestId → 409 IDEMPOTENCY_CONFLICT (la fase forma parte de la huella)', async () => {
    const sandbox = await startSandbox();
    sandbox.script.report = fixture('vitest-passing.json');
    const base = nodeRequest({ artifacts: [] });

    const first = await post(sandbox, { ...base, phase: 'GENERATED_TESTS' });
    expect(first.status, JSON.stringify(first.body)).toBe(202);

    const second = await post(sandbox, { ...base, phase: 'BASELINE' });

    expect(second.status, JSON.stringify(second.body)).toBe(409);
    expect(envelopeErrors(second.body)).toEqual([]);
    expect(second.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(sandbox.repository.findByRequestId(base.requestId)?.executionId).toBe(first.body.executionId);
    await finish(sandbox, first.body.executionId);
  });

  it('T9: executionProfile no soportado → 400 con ErrorEnvelope válido y sin ejecución aceptada', async () => {
    const sandbox = await startSandbox();
    const body = nodeRequest({ executionProfile: 'PYTHON_PYTEST' });

    const response = await post(sandbox, body);

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(envelopeErrors(response.body)).toEqual([]);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(sandbox.repository.findByRequestId(body.requestId)).toBeNull();
    expect(sandbox.commands).toEqual([]);
  });

  describe('T10: ErrorEnvelope de la API sin campo retryable', () => {
    it('400 por validación, 400 por Idempotency-Key ausente y 401 sin token', async () => {
      const sandbox = await startSandbox();
      const body = nodeRequest();

      const invalid = await post(sandbox, { ...body, command: 'rm -rf /' });
      expect(invalid.status).toBe(400);
      expect(envelopeErrors(invalid.body)).toEqual([]);
      expect(invalid.body).not.toHaveProperty('retryable');

      const missingKey = await request(sandbox.app.getHttpServer()).post('/executions').set(auth).send(body);
      expect(missingKey.status).toBe(400);
      expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(envelopeErrors(missingKey.body)).toEqual([]);
      expect(missingKey.body).not.toHaveProperty('retryable');

      const unauthorized = await request(sandbox.app.getHttpServer()).post('/executions').send(body);
      expect(unauthorized.status).toBe(401);
      expect(envelopeErrors(unauthorized.body)).toEqual([]);
      expect(unauthorized.body).not.toHaveProperty('retryable');
    });
  });
});

describe('C-07 Sandbox → Execution Coordinator', () => {
  it('T1: resultado NODE real (Vitest) cumple SandboxExecutionResultResponse y declara facts.executionProfile = NODE_TYPESCRIPT', async () => {
    const sandbox = await startSandbox();
    sandbox.script.report = fixture('vitest-passing.json');

    const { result } = await runToResult(sandbox, nodeRequest({ phase: undefined }));

    expect(result.status).toBe('COMPLETED');
    expect(result.facts.executionProfile).toBe('NODE_TYPESCRIPT');
    expect(result.facts.runner).toBe('VITEST');
    expect(result.facts.passed).toBe(true);
    expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
  });

  it('T1b: suitePath se relativiza a la raíz del proyecto dentro del contenedor (/app), no se emite absoluto', async () => {
    const sandbox = await startSandbox();
    // Jest/Vitest informan la ruta del archivo tal como la ve el proceso dentro del contenedor (cwd /app).
    sandbox.script.report = fixture('vitest-passing.json').replaceAll('/private/tmp/runner-fixtures/vitest-project/', '/app/');

    const { result } = await runToResult(sandbox, nodeRequest({ phase: undefined }));

    expect(result.facts.testCases.map((c: { suitePath: string }) => c.suitePath)).toEqual(['src/math.test.js', 'src/math.test.js']);
    expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
  });

  it('T2: resultado PHP real (PHPUnit JUnit) cumple SandboxExecutionResultResponse y declara facts.executionProfile = PHP_LARAVEL_PHPUNIT', async () => {
    const sandbox = await startSandbox();
    sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
    sandbox.script.report = fixture('phpunit-passing.xml');

    const { result } = await runToResult(sandbox, phpRequest());

    expect(result.status).toBe('COMPLETED');
    expect(result.facts.executionProfile).toBe('PHP_LARAVEL_PHPUNIT');
    expect(result.facts.runner).toBe('PHPUNIT');
    expect(result.facts.passed).toBe(true);
    expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
  });

  it('T3: toda evidence[].stage es un SandboxStage válido (escenarios de éxito, fallo de test, compilación y timeout)', async () => {
    const scenarios: Array<(sandbox: Sandbox) => Promise<Record<string, any>>> = [
      async (sandbox) => {
        sandbox.script.report = fixture('vitest-passing.json');
        return (await runToResult(sandbox, nodeRequest({ phase: undefined }))).result;
      },
      async (sandbox) => {
        sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
        sandbox.script.report = fixture('phpunit-mixed.xml');
        sandbox.script.test = { exitCode: 1 };
        return (await runToResult(sandbox, phpRequest({ projectRoot: '.', phase: 'BASELINE', artifacts: [] }))).result;
      },
      async (sandbox) => {
        sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
        sandbox.script.report = '';
        sandbox.script.test = { exitCode: 255, stdout: 'Message:  syntax error, unexpected token "{"\n' };
        return (await runToResult(sandbox, phpRequest({ projectRoot: '.', phase: 'BASELINE', artifacts: [] }))).result;
      },
      async (sandbox) => {
        sandbox.script.test = { timedOut: true, exitCode: null };
        return (await runToResult(sandbox, nodeRequest({ phase: undefined }))).result;
      },
    ];

    for (const scenario of scenarios) {
      const sandbox = await startSandbox();
      const result = await scenario(sandbox);
      expect(result.evidence.length).toBeGreaterThan(0);
      for (const item of result.evidence) {
        expect(validateContract(SCHEMA, 'SandboxStage', item.stage).errors).toEqual([]);
        expect(item.stage).toBe('RUNNING_TESTS');
      }
    }
  });

  describe('T7: fallo de test real (no es un fallo del Sandbox)', () => {
    it('Node: aserción fallida → COMPLETED con facts.passed=false, failure null y failureKind ASSERTION solo en el caso fallido', async () => {
      const sandbox = await startSandbox();
      sandbox.script.report = fixture('vitest-mixed.json');
      sandbox.script.test = { exitCode: 1 };

      const { result } = await runToResult(sandbox, nodeRequest({ phase: undefined }));

      expect(result.status).toBe('COMPLETED');
      expect(result.failure).toBeNull();
      expect(result.facts.passed).toBe(false);
      expect(result.facts.failedTests).toBe(1);
      const failed = result.facts.testCases.find((c: { name: string }) => c.name === 'sub is broken');
      const passed = result.facts.testCases.find((c: { name: string }) => c.name === 'add works');
      expect(failed).toMatchObject({ status: 'FAILED', failureKind: 'ASSERTION' });
      expect(passed).toMatchObject({ status: 'PASSED', failureKind: null });
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });

    it('PHP: <failure> JUnit → failureKind ASSERTION', async () => {
      const sandbox = await startSandbox();
      sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
      sandbox.script.report = fixture('phpunit-mixed.xml');
      sandbox.script.test = { exitCode: 1 };

      const { result } = await runToResult(sandbox, phpRequest({ projectRoot: '.', phase: 'BASELINE', artifacts: [] }));

      expect(result.status).toBe('COMPLETED');
      expect(result.failure).toBeNull();
      expect(result.facts.passed).toBe(false);
      const failed = result.facts.testCases.find((c: { name: string }) => c.name === 'testSubIsBroken');
      expect(failed).toMatchObject({ status: 'FAILED', failureKind: 'ASSERTION' });
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });

    it('PHP: <error> JUnit (excepción) → failureKind ERROR; <skipped/> → SKIPPED con failureKind null', async () => {
      const sandbox = await startSandbox();
      sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
      sandbox.script.report = fixture('phpunit-error-and-skipped.xml');
      sandbox.script.test = { exitCode: 1 };

      const { result } = await runToResult(sandbox, phpRequest({ projectRoot: '.', phase: 'BASELINE', artifacts: [] }));

      expect(result.status).toBe('COMPLETED');
      expect(result.failure).toBeNull();
      const errored = result.facts.testCases.find((c: { name: string }) => c.name === 'testThrowsUnexpectedException');
      const skipped = result.facts.testCases.find((c: { name: string }) => c.name === 'testIncompleteFeature');
      expect(errored).toMatchObject({ status: 'FAILED', failureKind: 'ERROR' });
      expect(skipped).toMatchObject({ status: 'SKIPPED', failureKind: null });
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });
  });

  describe('T8: fallos de plataforma y de compilación con failure.stage correcto', () => {
    it('timeout de tests → TIMED_OUT con failure TEST_TIMEOUT en RUNNING_TESTS', async () => {
      const sandbox = await startSandbox();
      sandbox.script.test = { timedOut: true, exitCode: null };

      const { result } = await runToResult(sandbox, nodeRequest({ phase: undefined }));

      expect(result.status).toBe('TIMED_OUT');
      expect(result.facts).toBeNull();
      expect(result.failure).toMatchObject({
        stage: 'RUNNING_TESTS',
        category: 'TEST_RUNTIME',
        code: 'TEST_TIMEOUT',
      });
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });

    it('imagen no disponible → FAILED con IMAGE_UNAVAILABLE/INFRASTRUCTURE en la etapa de instalación', async () => {
      const sandbox = await startSandbox();
      sandbox.script.installError = new ImageUnavailableError('image tjc-sandbox-node could not be pulled or built');

      const { executionId, result } = await runToResult(sandbox, nodeRequest({ phase: undefined }));

      expect(result.status).toBe('FAILED');
      expect(result.facts).toBeNull();
      expect(result.failure).toMatchObject({
        stage: 'INSTALLING_DEPENDENCIES',
        category: 'INFRASTRUCTURE',
        code: 'IMAGE_UNAVAILABLE',
      });
      const status = await get(sandbox, `/executions/${executionId}`);
      expect(status.body).toMatchObject({ status: 'FAILED', failureCode: 'IMAGE_UNAVAILABLE' });
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });

    it('test que no compila (PHP, reporte vacío y error de sintaxis) → FAILED con TEST_COMPILATION_FAILED/COMPILATION en RUNNING_TESTS', async () => {
      const sandbox = await startSandbox();
      sandbox.serve(SNAPSHOT_URL, await zip(PHP_PROJECT));
      const broken = sandbox.artifact('tests/Unit/BrokenTest.php', '<?php class BrokenTest {');
      sandbox.script.report = '';
      sandbox.script.test = {
        exitCode: 255,
        stdout: 'An error occurred inside PHPUnit.\n\nMessage:  syntax error, unexpected token "{", expecting variable\nLocation: /app/tests/Unit/BrokenTest.php:2\n',
      };

      const { result } = await runToResult(sandbox, phpRequest({ projectRoot: '.', phase: 'GENERATED_TESTS', artifacts: [broken] }));

      expect(result.status).toBe('FAILED');
      expect(result.facts).toBeNull();
      expect(result.failure).toMatchObject({
        stage: 'RUNNING_TESTS',
        category: 'COMPILATION',
        code: 'TEST_COMPILATION_FAILED',
      });
      expect(sandbox.commands[0]!.at(-1)).toBe('tests/Unit/BrokenTest.php');
      expect(schemaErrors('SandboxExecutionResultResponse', result)).toEqual([]);
    });
  });

  describe('T10: ErrorEnvelope de consulta', () => {
    it('404 para ejecución inexistente (estado y resultado) y 409 EXECUTION_NOT_FINISHED mientras corre', async () => {
      const sandbox = await startSandbox();
      const unknown = '00000000-0000-4000-8000-0000000000ff';

      const notFound = await get(sandbox, `/executions/${unknown}`);
      expect(notFound.status).toBe(404);
      expect(envelopeErrors(notFound.body)).toEqual([]);
      expect(notFound.body).not.toHaveProperty('retryable');

      const notFoundResult = await get(sandbox, `/executions/${unknown}/result`);
      expect(notFoundResult.status).toBe(404);
      expect(envelopeErrors(notFoundResult.body)).toEqual([]);

      let release!: () => void;
      sandbox.script.gate = new Promise<void>((resolveGate) => {
        release = resolveGate;
      });
      const accepted = await post(sandbox, nodeRequest({ phase: undefined }));
      expect(accepted.status).toBe(202);

      const notFinished = await get(sandbox, `/executions/${accepted.body.executionId}/result`);
      expect(notFinished.status).toBe(409);
      expect(envelopeErrors(notFinished.body)).toEqual([]);
      expect(notFinished.body.code).toBe('EXECUTION_NOT_FINISHED');
      expect(notFinished.body).not.toHaveProperty('retryable');

      release();
      await finish(sandbox, accepted.body.executionId);
    });
  });
});
