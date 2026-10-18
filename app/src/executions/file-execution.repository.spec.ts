import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRecord } from './domain/execution-record.js';
import { EXECUTION_REPOSITORY } from './execution.repository.js';
import { FileExecutionRepository, MAX_STATE_FILE_BYTES, defaultExecutionStateDir, sensitiveHostPaths } from './file-execution.repository.js';
import { SANDBOX_RESTARTED_CODE, serializeExecutionRecord } from './execution-state.codec.js';

const T0 = '2026-10-18T12:00:00.000Z';
const T0_MS = Date.parse(T0);
const SIGNED = 'https://storage.example.com/x?X-Signature=SECRETO';

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function record(n: number, status: ExecutionRecord['status'], updatedAt: string, extra: Partial<ExecutionRecord> = {}): ExecutionRecord {
  const terminal = status === 'COMPLETED' || status === 'FAILED' || status === 'TIMED_OUT';
  return {
    executionId: uuid(n),
    requestId: uuid(100 + n),
    testRunId: uuid(200 + n),
    projectVersionId: uuid(300 + n),
    snapshot: { role: 'PROJECT_SNAPSHOT', url: SIGNED, expiresAt: T0, sha256: 'a'.repeat(64), sizeBytes: 1 },
    projectRoot: 'packages/api',
    artifacts: [],
    scope: 'TARGET',
    targetIds: [uuid(400 + n)],
    executionProfile: 'NODE_TYPESCRIPT',
    runnerHint: 'VITEST',
    phase: 'GENERATED_TESTS',
    status,
    stage: status === 'PENDING' ? null : 'RUNNING_TESTS',
    failureCode: null,
    failureMessage: null,
    result: terminal
      ? { facts: null, failure: null, stageDurations: [], appliedArtifactIds: [], evidence: [] }
      : null,
    requestFingerprint: 'f'.repeat(64),
    startedAt: status === 'PENDING' ? null : '2026-10-18T11:59:00.000Z',
    completedAt: terminal ? updatedAt : null,
    createdAt: '2026-10-18T11:58:00.000Z',
    updatedAt,
    ...extra,
  };
}

function writeRecordFile(dir: string, fileName: string, value: unknown): void {
  writeFileSync(join(dir, fileName), typeof value === 'string' ? value : JSON.stringify(value));
}

/** Ejecuta `run` y devuelve el error que lanza; falla la prueba si no lanza. */
function captureError(run: () => void): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('se esperaba un error y no se lanzó ninguno');
}

describe('FileExecutionRepository', () => {
  let root: string;
  let dir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sbx-file-repo-'));
    dir = join(root, 'executions');
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const newRepo = (policy = { terminalTtlMs: 86_400_000, maxTerminalRecords: 500 }, now = T0_MS, hostPaths: string[] = []) =>
    new FileExecutionRepository(dir, policy, () => now, hostPaths);

  /** Repositorio ya arrancado (como en producción: `onModuleInit` antes de escribir). */
  const startedRepo = (policy?: { terminalTtlMs: number; maxTerminalRecords: number }, now = T0_MS, hostPaths: string[] = []) => {
    const repo = newRepo(policy, now, hostPaths);
    repo.onModuleInit();
    return repo;
  };

  describe('recarga tras reinicio', () => {
    it('devuelve el mismo registro terminal por id y por requestId tras reiniciar', () => {
      const original = record(1, 'COMPLETED', '2026-10-18T11:59:30.000Z');
      startedRepo().save(original);

      const restarted = newRepo();
      restarted.onModuleInit();

      const expected = { ...original, snapshot: { role: 'PROJECT_SNAPSHOT', url: '', sha256: '0'.repeat(64), sizeBytes: 0, expiresAt: original.createdAt }, projectRoot: '.', artifacts: [] };
      expect(restarted.findById(original.executionId)).toEqual(expected);
      expect(restarted.findByRequestId(original.requestId)).toEqual(expected);
    });

    it('crea el directorio si no existe, con permisos 0700', () => {
      newRepo().onModuleInit();
      expect(statSync(dir).isDirectory()).toBe(true);
      if (process.platform !== 'win32') expect(statSync(dir).mode & 0o777).toBe(0o700);
    });

    it('se engancha al ciclo de vida de Nest: un provider por factoría se carga antes de aceptar tráfico', async () => {
      mkdirSync(dir, { recursive: true });
      const original = record(7, 'FAILED', T0);
      writeRecordFile(dir, `${original.executionId}.json`, serializeExecutionRecord(original));

      const moduleRef = await Test.createTestingModule({
        providers: [{ provide: EXECUTION_REPOSITORY, useFactory: () => newRepo() }],
      }).compile();
      await moduleRef.init();

      expect(moduleRef.get(EXECUTION_REPOSITORY).findById(original.executionId)).not.toBeNull();
    });

    it('la ruta por defecto es persistente y del usuario, nunca el directorio temporal del sistema', () => {
      expect(defaultExecutionStateDir()).toMatch(/\.tjc-sandbox[\\/]executions$/);
      expect(defaultExecutionStateDir().startsWith(tmpdir())).toBe(false);
    });
  });

  describe('defensas en la recarga', () => {
    it('ignora con aviso los archivos inválidos, carga los válidos vecinos y no lanza', () => {
      mkdirSync(dir, { recursive: true });
      const valid = record(20, 'COMPLETED', '2026-10-18T11:59:30.000Z');
      const validJson = serializeExecutionRecord(valid);

      writeRecordFile(dir, `${uuid(10)}.json`, '{no es json');
      writeRecordFile(dir, `${uuid(11)}.json`, { schemaVersion: 1, executionId: uuid(11), status: 'COMPLETED' });
      writeRecordFile(dir, `${uuid(12)}.json`, { ...validJson, schemaVersion: 2, executionId: uuid(12) });
      writeRecordFile(dir, 'notas-del-operador.json', validJson);
      writeRecordFile(dir, `${uuid(13)}.json`, { ...validJson, executionId: uuid(14) });
      writeRecordFile(dir, `${uuid(15)}.json`, JSON.stringify(validJson) + ' '.repeat(MAX_STATE_FILE_BYTES));
      writeRecordFile(dir, `${valid.executionId}.json`, validJson);
      writeRecordFile(dir, `.${uuid(30)}.${uuid(31)}.tmp`, 'a medio escribir');

      const repo = newRepo();
      expect(() => repo.onModuleInit()).not.toThrow();

      expect(repo.findById(valid.executionId)).not.toBeNull();
      expect(repo.size).toBe(1);
      expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    });

    it('no sigue enlaces simbólicos ni lee fuera del directorio', () => {
      mkdirSync(dir, { recursive: true });
      const outside = join(root, 'outside.json');
      writeFileSync(outside, JSON.stringify(serializeExecutionRecord(record(40, 'COMPLETED', T0))));
      symlinkSync(outside, join(dir, `${uuid(40)}.json`));

      const repo = newRepo();
      repo.onModuleInit();

      expect(repo.findById(uuid(40))).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(uuid(40)));
    });

    it('marca como SANDBOX_RESTARTED los registros no terminales al recargar y reescribe el archivo', () => {
      const pending = record(50, 'PENDING', T0);
      const running = record(51, 'RUNNING_TESTS', T0);
      const writer = startedRepo();
      writer.save(pending);
      writer.save(running);

      const restartAt = T0_MS + 5 * 60_000;
      const restarted = newRepo(undefined, restartAt);
      restarted.onModuleInit();

      const restoredPending = restarted.findById(pending.executionId);
      expect(restoredPending?.status).toBe('FAILED');
      expect(restoredPending?.failureCode).toBe(SANDBOX_RESTARTED_CODE);
      expect(restoredPending?.stage).toBe('PREPARING');
      expect(restoredPending?.startedAt).toBe(pending.createdAt);
      expect(restoredPending?.completedAt).toBe(new Date(restartAt).toISOString());

      const restoredRunning = restarted.findById(running.executionId);
      expect(restoredRunning?.stage).toBe('RUNNING_TESTS');
      expect(restoredRunning?.startedAt).toBe(running.startedAt);
      expect(restoredRunning?.result?.failure?.code).toBe(SANDBOX_RESTARTED_CODE);

      const onDisk = JSON.parse(readFileSync(join(dir, `${running.executionId}.json`), 'utf8')) as { status: string; failureCode: string };
      expect(onDisk.status).toBe('FAILED');
      expect(onDisk.failureCode).toBe(SANDBOX_RESTARTED_CODE);
    });
  });

  describe('retención', () => {
    it('expulsa por TTL y por máximo de memoria y del disco, y nunca expulsa una ejecución en curso', () => {
      const repo = startedRepo({ terminalTtlMs: 3_600_000, maxTerminalRecords: 2 });
      const running = record(60, 'RUNNING_TESTS', '2020-01-01T00:00:00.000Z');
      repo.save(running);
      repo.save(record(61, 'COMPLETED', '2026-10-18T10:00:00.000Z')); // caducado por TTL
      repo.save(record(62, 'FAILED', '2026-10-18T11:30:00.000Z'));
      repo.save(record(63, 'COMPLETED', '2026-10-18T11:40:00.000Z'));
      repo.save(record(64, 'TIMED_OUT', '2026-10-18T11:50:00.000Z')); // supera el máximo: sale la 62

      expect(repo.findById(uuid(61))).toBeNull();
      expect(repo.findById(uuid(62))).toBeNull();
      expect(repo.findById(uuid(63))).not.toBeNull();
      expect(repo.findById(uuid(64))).not.toBeNull();
      expect(repo.findById(running.executionId)).not.toBeNull();
      expect(readdirSync(dir).sort()).toEqual([uuid(60), uuid(63), uuid(64)].map((id) => `${id}.json`).sort());
    });

    it('al recargar más tarde aplica la retención sobre lo cargado y borra del disco lo expirado', () => {
      const writer = startedRepo();
      writer.save(record(70, 'COMPLETED', '2026-10-18T11:00:00.000Z'));
      writer.save(record(71, 'FAILED', '2026-10-18T11:30:00.000Z'));
      writer.save(record(72, 'PENDING', '2026-10-18T11:31:00.000Z'));

      const twoHoursLater = T0_MS + 2 * 3_600_000;
      const repo = newRepo({ terminalTtlMs: 3_600_000, maxTerminalRecords: 500 }, twoHoursLater);
      repo.onModuleInit();

      expect(repo.findById(uuid(70))).toBeNull();
      expect(repo.findById(uuid(71))).toBeNull();
      expect(repo.findById(uuid(72))?.status).toBe('FAILED');
      expect(readdirSync(dir)).toEqual([`${uuid(72)}.json`]);
    });
  });

  describe('seguridad del contenido en disco', () => {
    it('ningún archivo contiene URLs firmadas, projectRoot, rutas del host ni https://', () => {
      const hostPath = '/srv/sandbox-workspaces/ws-HOSTPATH';
      const sensitive = record(80, 'COMPLETED', T0, {
        artifacts: [
          {
            artifactId: uuid(81),
            relativePath: 'src/foo.spec.ts',
            artifactType: 'CREATED',
            download: { role: 'GENERATED_ARTIFACT', url: `${SIGNED}&path=${hostPath}`, expiresAt: T0, sha256: 'b'.repeat(64), sizeBytes: 1 },
          },
        ],
      });
      startedRepo().save(sensitive);

      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf8');
        expect(content).not.toContain('SECRETO');
        expect(content).not.toContain('https://');
        expect(content).not.toContain('X-Signature');
        expect(content).not.toContain('packages/api');
        expect(content).not.toContain(hostPath);
        expect(content).not.toMatch(/"(snapshot|artifacts|projectRoot)"/);
      }
    });
  });

  describe('texto libre sensible en disco', () => {
    const WORKSPACE = '/srv/sandbox-workspaces';
    const HOST_PATHS = [WORKSPACE, tmpdir()];

    it('el archivo no contiene URLs firmadas ni rutas del workspace o de tmpdir en failureMessage ni en evidence', () => {
      const snapshotTmp = join(tmpdir(), 'sandbox-snapshot-77.zip');
      const sensitive = record(110, 'FAILED', T0, {
        failureCode: 'DOWNLOAD_FAILED',
        failureMessage: `Descarga fallida: ${SIGNED} (ENOENT ${WORKSPACE}/e110/a.zip)`,
        result: {
          facts: null,
          failure: { stage: 'PREPARING', category: 'INFRASTRUCTURE', code: 'DOWNLOAD_FAILED', message: `Fallo en ${snapshotTmp}` },
          stageDurations: [],
          appliedArtifactIds: [],
          evidence: [{ kind: 'TEST_STDERR', stage: 'RUNNING_TESTS', content: `leyendo ${snapshotTmp} desde ${SIGNED}`, truncated: false, originalBytes: null }],
        },
      });
      startedRepo(undefined, T0_MS, HOST_PATHS).save(sensitive);

      const files = readdirSync(dir);
      expect(files).toEqual([`${sensitive.executionId}.json`]);
      const content = readFileSync(join(dir, files[0]), 'utf8');
      expect(content).not.toContain('SECRETO');
      expect(content).not.toContain('https://');
      expect(content).not.toContain(WORKSPACE);
      expect(content).not.toContain(tmpdir());
      expect(content).toContain('[url-redactada]');
      expect(content).toContain('[ruta-redactada]');
    });

    it('una ejecución UNKNOWN cuyo error.message trae ruta absoluta y URL no persiste ninguna de las dos y conserva el código', () => {
      const message = `ENOENT: no such file or directory, open '${WORKSPACE}/e120/src/a.ts' (${SIGNED})`;
      const unknown = record(120, 'FAILED', T0, {
        failureCode: 'UNKNOWN',
        failureMessage: message,
        result: {
          facts: null,
          failure: { stage: 'RUNNING_TESTS', category: 'UNKNOWN', code: 'UNKNOWN', message },
          stageDurations: [],
          appliedArtifactIds: [],
          evidence: [],
        },
      });
      startedRepo(undefined, T0_MS, HOST_PATHS).save(unknown);

      const content = readFileSync(join(dir, `${uuid(120)}.json`), 'utf8');
      expect(content).not.toContain(WORKSPACE);
      expect(content).not.toContain('SECRETO');
      expect(content).not.toContain('https://');

      const restarted = startedRepo();
      expect(restarted.findById(uuid(120))?.failureCode).toBe('UNKNOWN');
      expect(restarted.findById(uuid(120))?.result?.failure).toEqual({
        stage: 'RUNNING_TESTS',
        category: 'UNKNOWN',
        code: 'UNKNOWN',
        message: "ENOENT: no such file or directory, open '[ruta-redactada]' ([url-redactada])",
      });
    });

    it('los registros sin datos sensibles se conservan idénticos tras reiniciar', () => {
      const plain = record(130, 'FAILED', T0, {
        failureCode: 'TEST_FAILED',
        failureMessage: 'Dos pruebas fallaron',
        result: {
          facts: null,
          failure: { stage: 'RUNNING_TESTS', category: 'TEST_ASSERTION', code: 'TEST_FAILED', message: 'Dos pruebas fallaron' },
          stageDurations: [{ stage: 'RUNNING_TESTS', durationMs: 42 }],
          appliedArtifactIds: [uuid(131)],
          evidence: [{ kind: 'RUNNER_REPORT', stage: 'RUNNING_TESTS', content: '{"ok":false}', truncated: false, originalBytes: 12 }],
        },
      });
      startedRepo(undefined, T0_MS, HOST_PATHS).save(plain);

      const restarted = newRepo();
      restarted.onModuleInit();
      expect(restarted.findById(uuid(130))?.failureMessage).toBe('Dos pruebas fallaron');
      expect(restarted.findById(uuid(130))?.result).toEqual(plain.result);
    });

    it('sensitiveHostPaths incluye el workspace (sin barra final), tmpdir y homedir', () => {
      const paths = sensitiveHostPaths('/srv/sandbox-workspaces/');
      expect(paths).toContain('/srv/sandbox-workspaces');
      expect(paths).toContain(tmpdir());
      expect(paths).toContain(homedir());
    });
  });

  describe('permisos', () => {
    it.skipIf(process.platform === 'win32')('crea el directorio 0700 y los archivos 0600', () => {
      const repo = newRepo();
      repo.onModuleInit();
      repo.save(record(90, 'COMPLETED', T0));
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(join(dir, `${uuid(90)}.json`)).mode & 0o777).toBe(0o600);
    });
  });

  describe('fallos de escritura', () => {
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('un directorio de solo lectura no hace lanzar a save y el registro sigue en memoria', () => {
      const repo = newRepo();
      repo.onModuleInit();
      chmodSync(dir, 0o500);
      try {
        const failing = record(95, 'PENDING', T0);
        expect(() => repo.save(failing)).not.toThrow();
        expect(repo.findById(failing.executionId)).not.toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No se pudo persistir'));
      } finally {
        chmodSync(dir, 0o700);
      }
    });

    it('un id que no es UUID no se persiste ni se usa como ruta', () => {
      const repo = newRepo();
      repo.onModuleInit();
      const hostile = { ...record(96, 'COMPLETED', T0), executionId: '../escape' };
      expect(() => repo.save(hostile)).not.toThrow();
      expect(readdirSync(dir)).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no válido'));
    });
  });

  describe('directorio de estado inutilizable', () => {
    it('un directorio que es un archivo impide arrancar con un mensaje que nombra la variable, la ruta y la causa', () => {
      writeFileSync(dir, 'no soy un directorio');
      const error = captureError(() => newRepo().onModuleInit());
      expect(error.message).toContain('SANDBOX_EXECUTION_STATE_DIR');
      expect(error.message).toContain(dir);
      expect(error.message).toContain('EEXIST');
    });

    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('un padre sin permiso de escritura impide arrancar con un mensaje que nombra la variable, la ruta y EACCES', () => {
      const locked = join(root, 'locked');
      mkdirSync(locked);
      chmodSync(locked, 0o500);
      try {
        const target = join(locked, 'executions');
        const error = captureError(() => new FileExecutionRepository(target).onModuleInit());
        expect(error.message).toContain('SANDBOX_EXECUTION_STATE_DIR');
        expect(error.message).toContain(target);
        expect(error.message).toContain('EACCES');
      } finally {
        chmodSync(locked, 0o700);
      }
    });
  });
});
