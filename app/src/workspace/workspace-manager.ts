import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InvalidArtifactPathError } from '../common/errors/sandbox-fact-error.js';
import { resolveSandboxLimits } from '../common/config/sandbox-limits.config.js';

const EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class WorkspaceManager {
  private readonly logger = new Logger(WorkspaceManager.name);
  private readonly root: string;
  private readonly ttlMs: number;

  constructor(configService: ConfigService) {
    const limits = resolveSandboxLimits(configService);
    this.root = path.resolve(limits.workspaceRoot);
    this.ttlMs = limits.workspaceTtlMs;
  }

  getWorkspacePath(executionId: string): string {
    if (!EXECUTION_ID_PATTERN.test(executionId)) {
      throw new InvalidArtifactPathError(
        `executionId is not a valid workspace identifier: ${executionId}`,
      );
    }
    return path.join(this.root, executionId);
  }

  async createWorkspace(executionId: string): Promise<string> {
    const workspacePath = this.getWorkspacePath(executionId);
    await fs.mkdir(workspacePath, { recursive: true, mode: 0o700 });
    return workspacePath;
  }

  /**
   * Resuelve `relativePath` dentro de `workspacePath`, rechazando cualquier
   * resultado que escape del workspace (defensa en profundidad además de la
   * validación estática de `IsRelativePath`).
   */
  resolveWithin(workspacePath: string, relativePath: string): string {
    const resolvedRoot = path.resolve(workspacePath);
    const resolved = path.resolve(resolvedRoot, relativePath);
    const withinRoot =
      resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
    if (!withinRoot) {
      throw new InvalidArtifactPathError(
        `relativePath escapes the workspace: ${relativePath}`,
      );
    }
    return resolved;
  }

  /**
   * Tamaño real en disco del workspace (recursivo). Docker no puede aplicar
   * una cuota de disco por container con el storage driver `overlay2`
   * (default de Docker Desktop, el entorno aprobado): `HostConfig.DiskQuota`
   * solo funciona con `devicemapper`. Este es el sustituto a nivel de
   * aplicación (resource-limits transversal). No sigue symlinks (evita
   * ciclos y doble conteo del layout de `pnpm`, que enlaza dentro de
   * `node_modules/.pnpm`, no fuera del workspace).
   */
  async calculateDirectorySize(dirPath: string): Promise<number> {
    let total = 0;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await this.calculateDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath).catch(() => null);
        total += stats?.size ?? 0;
      }
    }
    return total;
  }

  async cleanup(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `failed to clean up workspace ${workspacePath}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Sweeper idempotente: elimina directorios de workspace más antiguos que el
   * TTL configurado. Nunca toca rutas fuera de la raíz administrada.
   */
  async sweepExpired(now: Date = new Date()): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const removed: string[] = [];
    for (const entry of entries) {
      if (!EXECUTION_ID_PATTERN.test(entry)) {
        continue;
      }
      const entryPath = path.join(this.root, entry);
      try {
        const stats = await fs.stat(entryPath);
        const ageMs = now.getTime() - stats.mtimeMs;
        if (ageMs >= this.ttlMs) {
          await this.cleanup(entryPath);
          removed.push(entryPath);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(
            `sweeper failed to inspect ${entryPath}: ${(error as Error).message}`,
          );
        }
      }
    }
    return removed;
  }
}
