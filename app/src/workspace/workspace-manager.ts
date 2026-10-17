import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  InvalidArtifactPathError,
  WorkspaceProvisioningFailedError,
} from '../common/errors/sandbox-fact-error.js';
import { resolveSandboxLimits } from '../common/config/sandbox-limits.config.js';

const EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHP_RUNNER_UID = 10001;
const execFileAsync = promisify(execFile);

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
    if (!this.usesAcl()) {
      // Docker Desktop (macOS/Windows) maps bind-mount ownership through its
      // file-sharing layer, so the 0700 workspace is already usable by the
      // runner UID and the Linux ACL utilities do not exist on the host.
      this.logger.debug(
        `skipping workspace ACL on platform ${process.platform}; Linux enforces it`,
      );
      return workspacePath;
    }
    try {
      await this.configurePhpRunnerAcl(workspacePath);
    } catch (error) {
      // The workspace is still empty at this point; remove it rather than
      // letting the pipeline proceed with permissions the runner cannot use.
      await this.removeWorkspaceTree(workspacePath).catch(() => undefined);
      throw new WorkspaceProvisioningFailedError(
        `Unable to provision isolated workspace ACL for UID ${PHP_RUNNER_UID}; Linux acl utilities (setfacl/getfacl) are required`,
        { cause: error },
      );
    }
    return workspacePath;
  }

  /**
   * Grants the non-root PHP runner access only to this execution workspace.
   * Default ACL entries are inherited by materialized files and directories;
   * the effective mask still follows each creator's requested mode. A
   * default entry preserves access for the host process UID on descendants
   * created by PHP. setfacl/getfacl are an explicit Linux
   * runtime prerequisite: lack of ACL support must fail closed, never fall
   * back to broad chmod permissions.
   */
  private async configurePhpRunnerAcl(workspacePath: string): Promise<void> {
    const hostUid = this.getHostUid();
    if (hostUid === undefined) {
      throw new Error('Cannot determine host process UID for workspace ACL');
    }
    const stats = await fs.lstat(workspacePath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Workspace path is not a real directory');
    }
    const identities = [...new Set([PHP_RUNNER_UID, hostUid])];
    const accessEntries = identities
      .filter((uid) => uid !== stats.uid)
      .map((uid) => `u:${uid}:rwx`);
    const defaultEntries = [
      'u::rwx',
      ...(hostUid === PHP_RUNNER_UID
        ? []
        : identities.map((uid) => `u:${uid}:rwx`)),
      'g::---',
      'm::rwx',
      'o::---',
    ];
    if (accessEntries.length > 0) {
      await this.runAclCommand('setfacl', [
        '-m',
        `${accessEntries.join(',')},m:rwx`,
        '--',
        workspacePath,
      ]);
    }
    await this.runAclCommand('setfacl', [
      '-d',
      '-m',
      defaultEntries.join(','),
      '--',
      workspacePath,
    ]);

    const acl = await this.runAclCommand('getfacl', [
      '-cpn',
      '--',
      workspacePath,
    ]);
    const entries = new Set(acl.split(/\r?\n/).map((entry) => entry.trim()));
    const requiredEntries = [
      'user::rwx',
      ...identities
        .filter((uid) => uid !== stats.uid)
        .map((uid) => `user:${uid}:rwx`),
      'group::---',
      'mask::rwx',
      'other::---',
      'default:user::rwx',
      `default:user:${PHP_RUNNER_UID}:rwx`,
      ...(hostUid === PHP_RUNNER_UID
        ? []
        : identities.map((uid) => `default:user:${uid}:rwx`)),
      'default:group::---',
      'default:mask::rwx',
      'default:other::---',
    ];
    const missingEntries = requiredEntries.filter(
      (entry) => !entries.has(entry),
    );
    if (missingEntries.length > 0) {
      throw new Error(
        `ACL verification failed; missing entries: ${missingEntries.join(', ')}`,
      );
    }
  }

  /**
   * ACLs are enforced only on Linux hosts, where the runner UID must be
   * granted access explicitly. Linux stays fail-closed.
   */
  protected usesAcl(): boolean {
    return process.platform === 'linux';
  }

  protected getHostUid(): number | undefined {
    return process.getuid?.();
  }

  protected async runAclCommand(
    command: 'setfacl' | 'getfacl',
    args: string[],
  ): Promise<string> {
    const { stdout } = await execFileAsync(command, args, {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
    return stdout;
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
   * Igual que `resolveWithin`, pero también rechaza un symlink existente en
   * cualquier componente del destino. Los artefactos se descargan después
   * de extraer un snapshot no confiable: una comprobación léxica sola
   * permitiría escribir fuera del repositorio a través de ese symlink.
   */
  async resolveWritableWithin(
    workspacePath: string,
    relativePath: string,
  ): Promise<string> {
    const destination = this.resolveWithin(workspacePath, relativePath);
    const relative = path.relative(path.resolve(workspacePath), destination);
    let current = path.resolve(workspacePath);

    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      try {
        const stats = await fs.lstat(current);
        if (stats.isSymbolicLink()) {
          throw new InvalidArtifactPathError(
            `relativePath traverses a symbolic link: ${relativePath}`,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }
    return destination;
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

  async cleanup(workspacePath: string): Promise<boolean> {
    try {
      // Ordinary executions are removable as-is (the container-side recovery
      // already repaired entries owned by the runner UID); only fall back to
      // host-side ACL restoration when plain removal is refused.
      try {
        await this.removeWorkspaceTree(workspacePath);
        return true;
      } catch {
        await this.restoreHostAccess(workspacePath);
        await this.removeWorkspaceTree(workspacePath);
        return true;
      }
    } catch (error) {
      this.logger.warn(
        `failed to clean up workspace ${workspacePath}: ${(error as Error).message}`,
      );
      // A process running as UID 10001 owns descendant directories and may
      // chmod them, reducing the inherited ACL mask. Without elevated host
      // privileges the host cannot reliably restore traversal/cleanup access;
      // report failure rather than claiming deletion or broadening privileges.
      return false;
    }
  }

  /**
   * Restores the host process' access after the untrusted runner may have
   * changed mode bits and reduced inherited ACL masks. Directories remain
   * traversable/removable by the host; regular files are host-readable only.
   * Symlinks and special files are never followed or modified.
   *
   * Call this after the runner exits and before reading files from the
   * workspace. Cleanup and the TTL sweeper call it again as recovery.
   */
  async restoreHostAccess(workspacePath: string): Promise<void> {
    const resolvedWorkspace = path.resolve(workspacePath);
    const relative = path.relative(this.root, resolvedWorkspace);
    if (
      relative === '' ||
      relative.includes(path.sep) ||
      !EXECUTION_ID_PATTERN.test(relative)
    ) {
      throw new InvalidArtifactPathError(
        `workspace path is not a managed execution directory: ${workspacePath}`,
      );
    }
    if (!this.usesAcl()) {
      return;
    }
    const hostUid = this.getHostUid();
    if (hostUid === undefined) {
      throw new Error('Cannot determine host process UID for workspace ACL');
    }

    const rootStats = await fs.lstat(resolvedWorkspace);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw new InvalidArtifactPathError(
        `workspace path is not a real directory: ${workspacePath}`,
      );
    }

    // setfacl requires ownership: without real root the host can only repair
    // entries it owns. Entries owned by the runner UID are repaired from the
    // runner container (restore-workspace-acl) and are never touched here.
    const privileged = process.getuid?.() === 0;
    const ownable = (uid: number): boolean => privileged || uid === hostUid;

    const visit = async (entryPath: string): Promise<void> => {
      const stats = await fs.lstat(entryPath);
      if (stats.isSymbolicLink()) {
        return;
      }
      if (stats.isDirectory()) {
        if (ownable(stats.uid)) {
          await this.restoreEntryAcl(entryPath, hostUid, true, stats.uid);
        }
        const entries = await fs.readdir(entryPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isSymbolicLink()) {
            await visit(path.join(entryPath, entry.name));
          }
        }
      } else if (stats.isFile()) {
        if (ownable(stats.uid)) {
          await this.restoreEntryAcl(entryPath, hostUid, false, stats.uid);
        }
      }
    };

    await visit(resolvedWorkspace);
  }

  private async restoreEntryAcl(
    entryPath: string,
    hostUid: number,
    isDirectory: boolean,
    ownerUid: number,
  ): Promise<void> {
    const hostPermissions = isDirectory ? 'rwx' : 'r--';
    const mask = isDirectory ? 'rwx' : 'r--';
    const entries = [
      ...(ownerUid === hostUid ? [] : [`u:${hostUid}:${hostPermissions}`]),
      ...(!isDirectory && ownerUid === hostUid ? ['u::r--'] : []),
      'g::---',
      `m:${mask}`,
      'o::---',
    ];
    await this.runAclCommand('setfacl', [
      '-m',
      entries.join(','),
      '--',
      entryPath,
    ]);

    const acl = await this.runAclCommand('getfacl', ['-cpn', '--', entryPath]);
    const aclEntries = new Set(
      acl.split(/\r?\n/).map((entry) => entry.trim()),
    );
    const required = [
      ...(ownerUid === hostUid ? [] : [`user:${hostUid}:${hostPermissions}`]),
      ...(!isDirectory && ownerUid === hostUid ? ['user::r--'] : []),
      'group::---',
      `mask::${mask}`,
      'other::---',
    ];
    const missing = required.filter((entry) => !aclEntries.has(entry));
    if (missing.length > 0) {
      throw new Error(
        `ACL recovery verification failed for ${entryPath}; missing: ${missing.join(', ')}`,
      );
    }
  }

  protected async removeWorkspaceTree(workspacePath: string): Promise<void> {
    await fs.rm(workspacePath, { recursive: true, force: true });
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
          if (await this.cleanup(entryPath)) {
            removed.push(entryPath);
          }
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
