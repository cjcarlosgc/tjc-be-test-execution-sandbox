import type { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidArtifactPathError } from '../common/errors/sandbox-fact-error.js';
import { WorkspaceManager } from './workspace-manager.js';

const EXECUTION_ID = '11111111-1111-4111-8111-111111111111';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('WorkspaceManager', () => {
  let root: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-manager-'));
    manager = new WorkspaceManager(
      fakeConfigService({ SANDBOX_WORKSPACE_ROOT: root }),
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates a workspace directory named by executionId under the root', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    expect(workspacePath).toBe(path.join(root, EXECUTION_ID));
    const stats = await fs.stat(workspacePath);
    expect(stats.isDirectory()).toBe(true);
  });

  it('rejects an executionId that is not a UUID', () => {
    expect(() => manager.getWorkspacePath('../etc/passwd')).toThrow(
      InvalidArtifactPathError,
    );
  });

  it('resolves a safe relative path within the workspace', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    const resolved = manager.resolveWithin(workspacePath, 'src/foo.spec.ts');
    expect(resolved).toBe(path.join(workspacePath, 'src', 'foo.spec.ts'));
  });

  it('rejects a relative path that escapes the workspace', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    expect(() =>
      manager.resolveWithin(workspacePath, '../outside.txt'),
    ).toThrow(InvalidArtifactPathError);
  });

  it('removes the workspace directory on cleanup', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    await manager.cleanup(workspacePath);
    await expect(fs.stat(workspacePath)).rejects.toThrow();
  });

  it('sweeps directories older than the TTL and keeps recent ones', async () => {
    const oldId = '22222222-2222-4222-8222-222222222222';
    const freshId = '33333333-3333-4333-8333-333333333333';
    const ttlManager = new WorkspaceManager(
      fakeConfigService({
        SANDBOX_WORKSPACE_ROOT: root,
        SANDBOX_WORKSPACE_TTL_MS: 1000,
      }),
    );

    const oldPath = await ttlManager.createWorkspace(oldId);
    const freshPath = await ttlManager.createWorkspace(freshId);
    const old = new Date(Date.now() - 10_000);
    await fs.utimes(oldPath, old, old);

    const removed = await ttlManager.sweepExpired();

    expect(removed).toEqual([oldPath]);
    await expect(fs.stat(oldPath)).rejects.toThrow();
    await expect(fs.stat(freshPath)).resolves.toBeTruthy();
  });
});
