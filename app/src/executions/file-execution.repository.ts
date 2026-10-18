import { Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionRecord } from './domain/execution-record.js';
import { isTerminalStatus } from './domain/execution-record.js';
import {
  deserializeExecutionRecord,
  markInterruptedAsRestarted,
  serializeExecutionRecord,
} from './execution-state.codec.js';
import {
  DEFAULT_RETENTION,
  RetainedExecutionRepository,
  type ExecutionRetentionPolicy,
} from './execution.repository.js';

/** Tamaño máximo de un archivo de estado; la evidencia ya viene acotada, así que un archivo mayor no es legítimo. */
export const MAX_STATE_FILE_BYTES = 4 * 1024 * 1024;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const UUID_FILE_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEMP_FILE_SUFFIX = '.tmp';

/** Directorio por defecto: persistente y del usuario. Nunca `os.tmpdir()`, que se borra al reiniciar la VM. */
export function defaultExecutionStateDir(): string {
  return join(homedir(), '.tjc-sandbox', 'executions');
}

/**
 * Repositorio con persistencia en disco: cada ejecución se escribe en `<dir>/<executionId>.json` y se recarga al
 * arrancar. Los fallos de escritura se registran y no interrumpen la ejecución: la memoria sigue siendo la fuente
 * mientras el proceso vive. La carga y la escritura son síncronas para que `save` siga siendo síncrono.
 */
export class FileExecutionRepository extends RetainedExecutionRepository implements OnModuleInit {
  private readonly logger = new Logger(FileExecutionRepository.name);

  constructor(
    private readonly dir: string,
    policy: ExecutionRetentionPolicy = DEFAULT_RETENTION,
    now: () => number = Date.now,
  ) {
    super(policy, now);
  }

  /**
   * Antes de aceptar tráfico: crea o valida el directorio, borra temporales huérfanos, carga los archivos válidos,
   * marca como `SANDBOX_RESTARTED` los registros no terminales, aplica la retención y elimina lo expulsado.
   * Un archivo problemático se ignora con aviso; un directorio inutilizable sí impide arrancar.
   */
  onModuleInit(): void {
    this.ensureDirectory();
    this.removeTemporaryFiles();

    const nowIso = new Date(this.now()).toISOString();
    let restarted = 0;
    for (const fileName of readdirSync(this.dir).sort()) {
      if (fileName.endsWith(TEMP_FILE_SUFFIX)) continue;
      const record = this.loadFile(fileName);
      if (!record) continue;
      const restored = isTerminalStatus(record.status) ? record : markInterruptedAsRestarted(record, nowIso);
      if (restored !== record) restarted += 1;
      this.byExecutionId.set(restored.executionId, restored);
      this.byRequestId.set(restored.requestId, restored);
      if (restored !== record) this.persist(restored);
    }
    this.evict();

    if (restarted > 0) {
      this.logger.warn(`Recarga: ${restarted} ejecución(es) en curso marcadas FAILED con SANDBOX_RESTARTED.`);
    }
    this.logger.log(`Estado de ejecuciones cargado desde ${this.dir}: ${this.size} registro(s).`);
  }

  protected persist(record: ExecutionRecord): void {
    const target = this.pathFor(record.executionId);
    if (!target) {
      this.logger.warn(`No se persiste la ejecución con id no válido ${JSON.stringify(record.executionId)}.`);
      return;
    }
    const temporary = join(this.dir, `.${record.executionId}.${randomUUID()}${TEMP_FILE_SUFFIX}`);
    try {
      const json = `${JSON.stringify(serializeExecutionRecord(record))}\n`;
      const fd = openSync(temporary, 'wx', FILE_MODE);
      try {
        writeSync(fd, json);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, target);
    } catch (error) {
      this.logger.warn(`No se pudo persistir la ejecución ${record.executionId}: ${errorMessage(error)}`);
      removeQuietly(temporary);
    }
  }

  protected onEvicted(record: ExecutionRecord): void {
    const target = this.pathFor(record.executionId);
    if (!target) return;
    try {
      unlinkSync(target);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        this.logger.warn(`No se pudo borrar el estado expulsado ${record.executionId}: ${errorMessage(error)}`);
      }
    }
  }

  private ensureDirectory(): void {
    mkdirSync(this.dir, { recursive: true, mode: DIRECTORY_MODE });
    if (!statSync(this.dir).isDirectory()) {
      throw new Error(`${this.dir} existe y no es un directorio`);
    }
    if (process.platform !== 'win32') chmodSync(this.dir, DIRECTORY_MODE);
  }

  private removeTemporaryFiles(): void {
    for (const fileName of readdirSync(this.dir)) {
      if (!fileName.endsWith(TEMP_FILE_SUFFIX)) continue;
      removeQuietly(join(this.dir, fileName));
    }
  }

  /** Devuelve el registro del archivo o `null` si debe ignorarse (con aviso). Nunca lanza. */
  private loadFile(fileName: string): ExecutionRecord | null {
    const nameMatch = UUID_FILE_NAME.exec(fileName);
    if (!nameMatch) {
      this.logger.warn(`Estado ignorado: "${fileName}" no tiene el nombre <uuid>.json.`);
      return null;
    }
    const filePath = join(this.dir, fileName);
    try {
      const stat = lstatSync(filePath);
      if (stat.isSymbolicLink()) throw new Error('es un enlace simbólico');
      if (!stat.isFile()) throw new Error('no es un archivo regular');
      if (stat.size > MAX_STATE_FILE_BYTES) throw new Error(`supera ${MAX_STATE_FILE_BYTES} bytes`);

      const parsed: unknown = JSON.parse(readNoFollow(filePath));
      const record = deserializeExecutionRecord(parsed);
      if (record.executionId !== nameMatch[1]) {
        throw new Error('el executionId interno no coincide con el nombre del archivo');
      }
      return record;
    } catch (error) {
      this.logger.warn(`Estado ignorado "${fileName}": ${errorMessage(error)}`);
      return null;
    }
  }

  /** Ruta del archivo de una ejecución, o `null` si el id no tiene forma de UUID (evita recorrer rutas). */
  private pathFor(executionId: string): string | null {
    return UUID_PATTERN.test(executionId) ? join(this.dir, `${executionId}.json`) : null;
  }
}

/** Lee un archivo regular sin seguir enlaces, comprobando el tamaño sobre el descriptor abierto. */
function readNoFollow(filePath: string): string {
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const fd = openSync(filePath, fsConstants.O_RDONLY | noFollow);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('no es un archivo regular');
    if (stat.size > MAX_STATE_FILE_BYTES) throw new Error(`supera ${MAX_STATE_FILE_BYTES} bytes`);
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

function removeQuietly(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Ausente o no borrable: nada que hacer, el aviso (si procede) lo emite quien llamó.
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
