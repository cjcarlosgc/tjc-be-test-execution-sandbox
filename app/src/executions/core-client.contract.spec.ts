import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateContract } from '../contracts/contract-validator.js';
import {
  closeOpenSandboxes,
  example,
  fixture,
  get,
  NODE_PROJECT,
  SCHEMA,
  schemaErrors,
  startSandbox,
  TERMINAL,
  TOKEN,
  type Sandbox,
  zip,
} from '../../test/support/contract-real-sandbox.js';
import { FileExecutionRepository } from './file-execution.repository.js';

/*
 * WI-SANDBOX-009: el CLIENTE HTTP REAL de Core (SandboxExecutionService, solo lectura en ../tjc-be-rag-core-api) se
 * ejecuta contra el Sandbox real servido por HTTP (app.listen en 127.0.0.1, puerto efímero). Los bordes son los de
 * executions.contract-real.spec.ts (contenedor y descargas), reutilizados desde test/support; no se duplican sus 16 tests.
 *
 * Core se importa dinámicamente y solo si existe su carpeta hermana: si no, los describe se omiten con aviso y el CI del
 * Sandbox no depende de Core. Core no se modifica: su ObjectStorageService se simula con URLs que la política de
 * descarga del Sandbox acepta (https, host de SANDBOX_ALLOWED_DOWNLOAD_HOSTS, sin caducar), y el borde de descargas del
 * Sandbox verifica sha256/sizeBytes de lo que Core declara.
 */

const CORE_SANDBOX_DIR = resolve(
  __dirname,
  '../../../../tjc-be-rag-core-api/app/src/sandbox',
);
const CORE_AVAILABLE = existsSync(
  resolve(CORE_SANDBOX_DIR, 'sandbox-execution.service.ts'),
);

// Vitest no muestra la consola de un archivo con todo omitido, así que el aviso va en un test que solo corre sin Core.
it.skipIf(CORE_AVAILABLE)(
  'AVISO (no es una prueba): CT-06 y CT-07 con el cliente real de Core se omiten',
  () => {
    console.warn(
      `[WI-SANDBOX-009] Se omiten CT-06/CT-07 con el cliente real de Core: no existe ${resolve(CORE_SANDBOX_DIR, 'sandbox-execution.service.ts')}. ` +
        'El Sandbox no depende de Core para su CI; ejecútalo con el repositorio tjc-be-rag-core-api junto a este.',
    );
  },
);

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANDBOX_ENV = {
  SANDBOX_ALLOWED_DOWNLOAD_HOSTS: 'storage.example.test',
  SANDBOX_POLL_AFTER_MS: 5,
};
const STATUS_PATH = /\/executions\/[^/]+$/;

/** Subconjunto de los tipos de Core que usa el test (los tipos de Core no se importan en compilación). */
interface CoreRequest {
  requestId: string;
  testRunId: string;
  projectVersionId: string;
  snapshotKey: string;
  snapshotBuffer: Buffer;
  artifacts: {
    artifactId: string;
    relativePath: string;
    artifactType: 'CREATED' | 'MODIFIED';
    content: Buffer;
  }[];
  scope: 'TARGET' | 'BATCH';
  targetIds: string[];
  runnerHint: 'JEST' | 'VITEST' | 'PHPUNIT';
}
interface CoreOutcome {
  status: 'COMPLETED' | 'FAILED' | 'TIMED_OUT';
  facts: Record<string, any> | null;
  failure: {
    stage: string;
    category: string;
    code: string;
    message: string;
  } | null;
  evidence: { stage: string | null }[];
  executionId: string;
  executionProfile: string;
  requestId: string;
}
interface CoreClient {
  execute(request: CoreRequest): Promise<CoreOutcome>;
}
interface CoreModules {
  SandboxExecutionService: new (
    config: unknown,
    objectStorage: unknown,
  ) => CoreClient;
  sandboxGenerationRequestId: (jobId: string, targetId: string) => string;
  mapSandboxResult: (result: CoreOutcome) => {
    status: string;
    valid: boolean | null;
    failureType: string | null;
  };
}
interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

let core: CoreModules;

async function loadCore(): Promise<void> {
  // Import dinámico con URL file://: la ausencia de Core no rompe la carga de este archivo.
  const load = (file: string) =>
    import(
      /* @vite-ignore */ pathToFileURL(resolve(CORE_SANDBOX_DIR, file)).href
    );
  const [client, ids, mapping] = await Promise.all([
    load('sandbox-execution.service.ts'),
    load('sandbox-request-id.util.ts'),
    load('map-sandbox-result.ts'),
  ]);
  core = {
    SandboxExecutionService: client.SandboxExecutionService,
    sandboxGenerationRequestId: ids.sandboxGenerationRequestId,
    mapSandboxResult: mapping.mapSandboxResult,
  };
}

/** Configuración que Core lee de ConfigService; apunta al Sandbox servido por HTTP. */
const coreConfig = (sandboxUrl: string) => {
  const values: Record<string, unknown> = {
    SANDBOX_URL: sandboxUrl,
    SANDBOX_SERVICE_TOKEN: TOKEN,
    SANDBOX_DOWNLOAD_TTL_SECONDS: 300,
    SANDBOX_REQUEST_TIMEOUT_MS: 5000,
    SANDBOX_MAX_POLL_ATTEMPTS: 50,
  };
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  };
};

/** ObjectStorageService simulado: guarda los bytes y devuelve URLs que el Sandbox puede descargar (la misma que sirve). */
function coreObjectStorage(sandbox: Sandbox) {
  const stored = new Map<string, Buffer>();
  const urlFor = (key: string) =>
    `https://storage.example.test/${key}?sig=EXAMPLE`;
  const seed = (key: string, body: Buffer) => {
    stored.set(key, body);
    sandbox.serve(urlFor(key), body);
  };
  return {
    seed,
    put: async (key: string, body: Buffer) => seed(key, body),
    presignGet: async (key: string) => {
      if (!stored.has(key)) throw new Error(`no object for ${key}`);
      return urlFor(key);
    },
  };
}

/** Petición que Core construiría para una ejecución Node/Vitest con un artefacto generado. */
async function coreRequest(
  storage: ReturnType<typeof coreObjectStorage>,
  jobId: string,
) {
  const body = example<Record<string, any>>('sandbox-create-request.node.json');
  const snapshotKey = `snapshots/${randomUUID()}.zip`;
  const snapshotBuffer = await zip(NODE_PROJECT);
  storage.seed(snapshotKey, snapshotBuffer);
  const request: CoreRequest = {
    requestId: core.sandboxGenerationRequestId(jobId, body.targetIds[0]),
    testRunId: body.testRunId,
    projectVersionId: body.projectVersionId,
    snapshotKey,
    snapshotBuffer,
    artifacts: body.artifacts.map(
      (artifact: CoreRequest['artifacts'][number]) => ({
        artifactId: artifact.artifactId,
        relativePath: artifact.relativePath,
        artifactType: artifact.artifactType,
        content: Buffer.from('export {};\n', 'utf8'),
      }),
    ),
    scope: body.scope,
    targetIds: body.targetIds,
    runnerHint: 'VITEST',
  };
  return { request, requestId: request.requestId };
}

/** Advertencias de validación de contrato que Core emite en su logger (no lanza; INTEROP §7). */
const contractDriftWarnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.filter(([message]) =>
    String(message).includes('Contrato Core↔Sandbox'),
  );

const coreLogger = (client: CoreClient) =>
  (client as unknown as { logger: { warn: (...args: unknown[]) => void } })
    .logger;

const headersOf = (init?: RequestInit): Record<string, string> =>
  Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>).map(
      ([name, value]) => [name.toLowerCase(), value],
    ),
  );
const bodyOf = (init?: RequestInit): unknown =>
  typeof init?.body === 'string'
    ? (JSON.parse(init.body) as unknown)
    : undefined;

/** Registra las llamadas HTTP que hace el cliente de Core (sin alterarlas). */
function recordFetch(): Captured[] {
  const log: Captured[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    log.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      url: String(input),
      headers: headersOf(init),
      body: bodyOf(init),
    });
    return realFetch(input, init);
  });
  return log;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeOpenSandboxes();
});

describe.skipIf(!CORE_AVAILABLE)('CT-06 Core (cliente real) → Sandbox', () => {
  beforeAll(loadCore);

  it('caso feliz: Core envía una petición válida, el Sandbox la acepta, Core sondea hasta COMPLETED y mapea el resultado sin advertencias de contrato', async () => {
    const sandbox = await startSandbox({
      listen: true,
      verifyDownloads: true,
      env: SANDBOX_ENV,
    });
    sandbox.script.report = fixture('vitest-passing.json').replaceAll(
      '/private/tmp/runner-fixtures/vitest-project/',
      '/app/',
    );
    const calls = recordFetch();
    const storage = coreObjectStorage(sandbox);
    const client = new core.SandboxExecutionService(
      coreConfig(sandbox.url!),
      storage,
    );
    const warn = vi.spyOn(coreLogger(client), 'warn');
    const { request, requestId } = await coreRequest(storage, randomUUID());

    const outcome = await client.execute(request);

    // CT-06: la petición que construye Core cumple el contrato, va autenticada y usa el requestId UUID v5 de Core.
    const [posted] = calls.filter((call) => call.method === 'POST');
    expect(posted.url).toBe(`${sandbox.url}/executions`);
    expect(posted.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(posted.headers['idempotency-key']).toBe(requestId);
    expect(
      validateContract(SCHEMA, 'CreateSandboxExecutionRequest', posted.body)
        .errors,
    ).toEqual([]);
    expect(requestId).toMatch(UUID_V5);
    expect((posted.body as { requestId: string }).requestId).toBe(requestId);
    expect(outcome.requestId).toBe(requestId);

    // Sondeo: al menos una consulta de estado y, al final, la lectura del resultado.
    const gets = calls.filter((call) => call.method === 'GET');
    expect(gets.some((call) => STATUS_PATH.test(call.url))).toBe(true);
    expect(gets.at(-1)?.url).toMatch(/\/executions\/[^/]+\/result$/);

    // CT-07: el resultado llega íntegro a Core.
    expect(outcome.status).toBe('COMPLETED');
    expect(outcome.failure).toBeNull();
    expect(outcome.executionProfile).toBe('NODE_TYPESCRIPT');
    expect(outcome.facts).toMatchObject({
      runner: 'VITEST',
      executionProfile: 'NODE_TYPESCRIPT',
      compiled: true,
      executed: true,
      passed: true,
      failedTests: 0,
    });
    expect(outcome.facts!.totalTests).toBe(
      outcome.facts!.passedTests +
        outcome.facts!.failedTests +
        outcome.facts!.skippedTests,
    );
    expect(
      outcome.facts!.testCases.map(
        (testCase: { suitePath: string }) => testCase.suitePath,
      ),
    ).toEqual(['src/math.test.js', 'src/math.test.js']);
    expect(outcome.evidence.length).toBeGreaterThan(0);
    for (const item of outcome.evidence) {
      expect(
        validateContract(SCHEMA, 'SandboxStage', item.stage).errors,
      ).toEqual([]);
    }
    expect(core.mapSandboxResult(outcome)).toMatchObject({
      status: 'VALID',
      valid: true,
      failureType: 'NONE',
    });

    // Las respuestas de estado y resultado que consume Core cumplen el esquema canónico.
    const status = await get(sandbox, `/executions/${outcome.executionId}`);
    expect(schemaErrors('SandboxExecutionStatusResponse', status.body)).toEqual(
      [],
    );
    const result = await get(
      sandbox,
      `/executions/${outcome.executionId}/result`,
    );
    expect(schemaErrors('SandboxExecutionResultResponse', result.body)).toEqual(
      [],
    );

    // Ninguna respuesta del Sandbox (aceptación ni resultado) desvía del esquema canónico según Core.
    expect(contractDriftWarnings(warn)).toEqual([]);
  });
});

describe.skipIf(!CORE_AVAILABLE)('CT-07 Sandbox → Core (cliente real)', () => {
  beforeAll(loadCore);

  it('fallo terminal: un reinicio del Sandbox con la ejecución en curso se entiende como FAILED/INFRASTRUCTURE/SANDBOX_RESTARTED, sin sondeo infinito ni error de contrato', async () => {
    const stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'wi-sandbox-009-state-'),
    );
    try {
      // Primera instancia: repositorio persistido; la instalación nunca termina, así que la ejecución queda en curso.
      const first = await startSandbox({
        listen: true,
        verifyDownloads: true,
        env: SANDBOX_ENV,
        repository: new FileExecutionRepository(stateDir),
      });
      // La instalación se detiene aquí: la ejecución queda en curso y el reinicio no compite con el pipeline.
      const installing = new Promise<void>((resolveInstall) => {
        first.script.onInstall = resolveInstall;
      });
      first.script.gate = new Promise<void>(() => undefined);

      const log: Captured[] = [];
      const realFetch = globalThis.fetch;
      let acceptedExecutionId: string | undefined;
      let statusAtRestart: string | undefined;
      let second: Sandbox | undefined;

      // Reinicio: se cierra la instancia y se levanta una nueva sobre el mismo directorio de estado. Core sigue usando la
      // URL original; el "balanceador" de este test la redirige a la instancia nueva tras la aceptación.
      const restart = async (): Promise<string> => {
        await installing;
        statusAtRestart = first.repository.findById(
          acceptedExecutionId!,
        )?.status;
        await first.close();
        const restored = new FileExecutionRepository(stateDir);
        restored.onModuleInit();
        second = await startSandbox({
          listen: true,
          verifyDownloads: true,
          env: SANDBOX_ENV,
          repository: restored,
        });
        return second.url!;
      };
      let restartedUrl: Promise<string> | undefined;

      vi.stubGlobal(
        'fetch',
        async (input: string | URL, init?: RequestInit) => {
          const original = String(input);
          const method = (init?.method ?? 'GET').toUpperCase();
          log.push({
            method,
            url: original,
            headers: headersOf(init),
            body: bodyOf(init),
          });
          if (method === 'POST') {
            const upstream = await realFetch(original, init);
            const text = await upstream.text();
            acceptedExecutionId = (JSON.parse(text) as { executionId: string })
              .executionId;
            restartedUrl = restart();
            restartedUrl.catch(() => undefined);
            return new Response(text, {
              status: upstream.status,
              headers: upstream.headers,
            });
          }
          const target = restartedUrl
            ? original.replace(first.url!, await restartedUrl)
            : original;
          return realFetch(target, init);
        },
      );

      const storage = coreObjectStorage(first);
      const client = new core.SandboxExecutionService(
        coreConfig(first.url!),
        storage,
      );
      const warn = vi.spyOn(coreLogger(client), 'warn');
      const { request, requestId } = await coreRequest(storage, randomUUID());

      const outcome = await client.execute(request);

      // La ejecución estaba en curso cuando se reinició el Sandbox.
      expect(statusAtRestart).toBeDefined();
      expect(TERMINAL).not.toContain(statusAtRestart);
      expect(outcome.requestId).toBe(requestId);

      // Core lo entiende como fallo terminal: resuelve (no lanza), una sola consulta de estado y una de resultado.
      expect(outcome.executionId).toBe(acceptedExecutionId);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.facts).toBeNull();
      expect(outcome.failure).toMatchObject({
        category: 'INFRASTRUCTURE',
        code: 'SANDBOX_RESTARTED',
      });
      expect(
        validateContract(SCHEMA, 'SandboxStage', outcome.failure!.stage).errors,
      ).toEqual([]);
      expect(core.mapSandboxResult(outcome)).toMatchObject({
        status: 'FAILED',
        failureType: 'INFRASTRUCTURE',
      });
      expect(
        log.filter(
          (call) => call.method === 'GET' && STATUS_PATH.test(call.url),
        ),
      ).toHaveLength(1);
      expect(
        log.filter(
          (call) => call.method === 'GET' && call.url.endsWith('/result'),
        ),
      ).toHaveLength(1);

      // El Sandbox nuevo persistió el fallo terminal para la ejecución original.
      expect(second!.repository.findById(acceptedExecutionId!)).toMatchObject({
        status: 'FAILED',
        failureCode: 'SANDBOX_RESTARTED',
      });
      const status = await get(second!, `/executions/${acceptedExecutionId}`);
      expect(
        schemaErrors('SandboxExecutionStatusResponse', status.body),
      ).toEqual([]);
      expect(status.body).toMatchObject({
        status: 'FAILED',
        failureCode: 'SANDBOX_RESTARTED',
      });

      // Ningún desvío de contrato según Core.
      expect(contractDriftWarnings(warn)).toEqual([]);
      await second?.close();
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });
});
