import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
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
import { expect } from 'vitest';
import { ZipFile } from 'yazl';
import { resolveSandboxLimits } from '../../src/common/config/sandbox-limits.config.js';
import { BearerAuthGuard } from '../../src/common/auth/bearer-auth.guard.js';
import { CorrelationIdMiddleware } from '../../src/common/http/correlation-id.middleware.js';
import { HttpExceptionFilter } from '../../src/common/http/http-exception.filter.js';
import type { EphemeralDownloadRef } from '../../src/common/contracts/sandbox-execution.contract.js';
import {
  InputDownloadFailedError,
  IntegrityCheckFailedError,
} from '../../src/common/errors/sandbox-fact-error.js';
import type {
  ContainerRunner,
  ContainerRunResult,
} from '../../src/container/container-runner.service.js';
import { validateContract } from '../../src/contracts/contract-validator.js';
import { ArtifactMaterializer } from '../../src/materialization/artifact-materializer.js';
import { JestTestRunnerAdapter } from '../../src/runner-adapters/jest-test-runner.adapter.js';
import { PhpunitTestRunnerAdapter } from '../../src/runner-adapters/phpunit-test-runner.adapter.js';
import { RunnerAdapterRegistry } from '../../src/runner-adapters/runner-adapter-registry.js';
import { VitestTestRunnerAdapter } from '../../src/runner-adapters/vitest-test-runner.adapter.js';
import { ExecutionPipelineService } from '../../src/executions/execution-pipeline.service.js';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepository,
  InMemoryExecutionRepository,
} from '../../src/executions/execution.repository.js';
import { ExecutionsController } from '../../src/executions/executions.controller.js';
import { ExecutionsService } from '../../src/executions/executions.service.js';
import { assertDownloadPolicy } from '../../src/workspace/download-policy.js';
import type { ExecutionInputDownloadService } from '../../src/workspace/execution-input-download.service.js';
import { SafeArchiveExtractor } from '../../src/workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';

/*
 * Montaje compartido de los tests de contrato Core ↔ Sandbox sobre resultados REALES del ExecutionPipelineService
 * (evidencia CT-06 / CT-07). Lo usan executions.contract-real.spec.ts (en proceso, con supertest) y
 * core-client.contract.spec.ts (servido por HTTP real con app.listen).
 *
 * Real: HTTP (Nest, guard de Bearer, ValidationPipe, HttpExceptionFilter), ExecutionsService, ExecutionPipelineService,
 * ArtifactMaterializer, SafeArchiveExtractor, WorkspaceManager (salvo creación/limpieza de directorios), RunnerAdapterRegistry
 * con los adapters Jest/Vitest/PHPUnit y sus parsers, y la validación contra spec/contracts/schemas.
 * Fakes en los bordes: el contenedor (ContainerRunner: instalación y ejecución de tests), las descargas de snapshot y
 * artefactos (ExecutionInputDownloadService) y la creación de workspace. La salida del runner son fixtures reales de
 * Jest/Vitest (JSON) y PHPUnit (JUnit XML) de src/runner-adapters/fixtures.
 */

export const SCHEMA = 'sandbox-execution.schema.json' as const;
export const ENVELOPE = 'error-envelope.schema.json' as const;
export const TOKEN = 'contract-real-test-token';
export const auth = { Authorization: `Bearer ${TOKEN}` };
export const TERMINAL = ['COMPLETED', 'FAILED', 'TIMED_OUT'];

const FIXTURES = resolve(__dirname, '../../src/runner-adapters/fixtures');
const EXAMPLES = resolve(__dirname, '../../../spec/contracts/schemas/examples');
export const fixture = (name: string): string =>
  readFileSync(resolve(FIXTURES, name), 'utf8');
export const example = <T = Record<string, any>>(name: string): T =>
  JSON.parse(readFileSync(resolve(EXAMPLES, name), 'utf8')) as T;

export const SNAPSHOT_URL =
  'https://storage.example.test/snapshot.zip?sig=EXAMPLE';
const EXAMPLE_ARTIFACT_URL =
  'https://storage.example.test/foo.spec.ts?sig=EXAMPLE';

export const NODE_PROJECT: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'demo',
    devDependencies: { vitest: '^3.0.0' },
  }),
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'src/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
};
export const PHP_PROJECT: Record<string, string> = {
  'composer.json': JSON.stringify({
    'require-dev': { 'phpunit/phpunit': '^11.0' },
  }),
  'apps/api/composer.json': JSON.stringify({
    'require-dev': { 'phpunit/phpunit': '^11.0' },
  }),
};

export interface ContainerScript {
  /** Se invoca al entrar en la instalación de dependencias, antes de esperar `gate`. */
  onInstall?: () => void;
  /** Si se define, la instalación espera a esta promesa (para observar estados intermedios). */
  gate?: Promise<void>;
  installError?: Error;
  install: Partial<ContainerRunResult>;
  testError?: Error;
  test: Partial<ContainerRunResult>;
  /** Contenido que el runner escribe en `.sandbox-results.json`; undefined = no escribe reporte. */
  report?: string;
}

export interface StartSandboxOptions {
  /** Repositorio de ejecuciones; por defecto en memoria. */
  repository?: ExecutionRepository;
  /** Variables extra de configuración (p. ej. SANDBOX_POLL_AFTER_MS, SANDBOX_ALLOWED_DOWNLOAD_HOSTS). */
  env?: Record<string, unknown>;
  /** Sirve la app por HTTP real con `app.listen(0, '127.0.0.1')` y expone `sandbox.url`. */
  listen?: boolean;
  /**
   * Aplica en el borde de descargas la política real del Sandbox (https, host permitido, referencia no caducada)
   * y verifica sha256/sizeBytes de lo descargado. Sin esta opción el borde sirve bytes sin comprobar nada.
   */
  verifyDownloads?: boolean;
}

export interface Sandbox {
  app: INestApplication;
  repository: ExecutionRepository;
  script: ContainerScript;
  /** Comando que el pipeline pasó al contenedor en cada ejecución de tests. */
  commands: string[][];
  /** Base HTTP (`http://127.0.0.1:PUERTO`) cuando se arrancó con `listen: true`; null en otro caso. */
  url: string | null;
  serve(url: string, body: Buffer | string): void;
  artifact(relativePath: string, content: string): Record<string, unknown>;
  close(): Promise<void>;
}

const open: Sandbox[] = [];

/** Cierra los Sandbox arrancados en el test; pensado para `afterEach`. */
export async function closeOpenSandboxes(): Promise<void> {
  await Promise.all(open.splice(0).map((sandbox) => sandbox.close()));
}

export function okContainerResult(
  overrides: Partial<ContainerRunResult> = {},
): ContainerRunResult {
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

export function zip(files: Record<string, string>): Promise<Buffer> {
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

export async function startSandbox(
  options: StartSandboxOptions = {},
): Promise<Sandbox> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-real-'));
  const overrides: Record<string, unknown> = {
    SANDBOX_SERVICE_TOKEN: TOKEN,
    SANDBOX_WORKSPACE_ROOT: root,
    ...options.env,
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key in overrides ? overrides[key] : fallback,
  } as unknown as ConfigService;

  const objects = new Map<string, Buffer>();
  const script: ContainerScript = { install: {}, test: {} };
  const commands: string[][] = [];

  // Borde de descargas: sirve bytes por URL; el extractor y el materializador reales hacen el resto.
  const downloads = {
    downloadToFile: async (
      ref: EphemeralDownloadRef,
      destinationPath: string,
    ) => {
      if (options.verifyDownloads) {
        assertDownloadPolicy(
          ref,
          resolveSandboxLimits(config).allowedDownloadHosts,
        );
      }
      const body = objects.get(ref.url);
      if (body === undefined) {
        throw new InputDownloadFailedError(`no object served for ${ref.role}`);
      }
      if (options.verifyDownloads) {
        const sha256 = createHash('sha256').update(body).digest('hex');
        if (sha256 !== ref.sha256 || body.length !== ref.sizeBytes) {
          throw new IntegrityCheckFailedError(
            `integrity mismatch for ${ref.role}`,
          );
        }
      }
      await fs.writeFile(destinationPath, body);
      return {
        path: destinationPath,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
    },
  } as unknown as ExecutionInputDownloadService;

  // Borde de workspace: directorios planos (sin ACL de Linux); el resto de WorkspaceManager es real.
  const realWorkspaces = new WorkspaceManager(config);
  const workspaces = Object.assign(
    Object.create(realWorkspaces) as WorkspaceManager,
    {
      createWorkspace: async (executionId: string) => {
        const dir = path.join(root, executionId);
        await fs.mkdir(dir, { recursive: true });
        return dir;
      },
      cleanup: async (dir: string) => {
        await fs.rm(dir, { recursive: true, force: true });
        return true;
      },
    },
  );

  // Borde de contenedor: simula instalación y ejecución; escribe el reporte del runner en la ruta montada.
  const containerRunner = {
    installDependencies: async () => {
      script.onInstall?.();
      if (script.gate) await script.gate;
      if (script.installError) throw script.installError;
      return okContainerResult(script.install);
    },
    runTestCommand: async (
      _executionId: string,
      workspacePath: string,
      command: string[],
    ) => {
      commands.push(command);
      if (script.testError) throw script.testError;
      if (script.report !== undefined) {
        await fs.writeFile(
          path.join(workspacePath, '.sandbox-results.json'),
          script.report,
          'utf8',
        );
      }
      return okContainerResult(script.test);
    },
    restorePhpWorkspaceAccess: async () => undefined,
  } as unknown as ContainerRunner;

  const repository = options.repository ?? new InMemoryExecutionRepository();
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
  app.use((req: any, res: any, next: any) =>
    new CorrelationIdMiddleware().use(req, res, next),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  let url: string | null = null;
  if (options.listen) {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  }

  const serve = (target: string, body: Buffer | string) => {
    objects.set(target, Buffer.from(body));
  };
  let closed = false;
  const sandbox: Sandbox = {
    app,
    repository,
    script,
    commands,
    url,
    serve,
    artifact(relativePath, content) {
      const artifactId = randomUUID();
      const artifactUrl = `https://storage.example.test/artifacts/${artifactId}?sig=EXAMPLE`;
      serve(artifactUrl, content);
      return {
        artifactId,
        relativePath,
        artifactType: 'CREATED',
        download: {
          role: 'GENERATED_ARTIFACT',
          url: artifactUrl,
          expiresAt: '2099-01-01T00:00:00.000Z',
          sha256: 'b'.repeat(64),
          sizeBytes: Buffer.byteLength(content),
        },
      };
    },
    async close() {
      if (closed) return;
      closed = true;
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

export const post = (
  sandbox: Sandbox,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) =>
  request(sandbox.app.getHttpServer())
    .post('/executions')
    .set(auth)
    .set('Idempotency-Key', idempotencyKey ?? (body.requestId as string))
    .send(body);

export const get = (sandbox: Sandbox, route: string) =>
  request(sandbox.app.getHttpServer()).get(route).set(auth);

/** Consulta el estado por HTTP hasta un estado terminal (el POST lanza el pipeline sin esperar). */
export async function finish(sandbox: Sandbox, executionId: string) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const response = await get(sandbox, `/executions/${executionId}`);
    if (TERMINAL.includes(response.body.status)) return response;
    if (Date.now() > deadline) {
      throw new Error(
        `execution ${executionId} did not finish (last status ${response.body.status})`,
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
}

export async function runToResult(
  sandbox: Sandbox,
  body: Record<string, unknown>,
) {
  const accepted = await post(sandbox, body);
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
  await finish(sandbox, accepted.body.executionId);
  const result = await get(
    sandbox,
    `/executions/${accepted.body.executionId}/result`,
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return {
    executionId: accepted.body.executionId as string,
    result: result.body,
  };
}

export const envelopeErrors = (body: unknown) =>
  validateContract(ENVELOPE, null, body).errors;
export const schemaErrors = (definition: string, body: unknown) =>
  validateContract(SCHEMA, definition, body).errors;

export const nodeRequest = (overrides: Record<string, unknown> = {}) => ({
  ...example('sandbox-create-request.node.json'),
  ...overrides,
});
export const phpRequest = (overrides: Record<string, unknown> = {}) => ({
  ...example('sandbox-create-request.php.json'),
  ...overrides,
});
