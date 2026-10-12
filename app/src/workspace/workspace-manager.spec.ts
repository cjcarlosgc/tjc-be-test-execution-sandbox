import type { ConfigService } from '@nestjs/config';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidArtifactPathError,
  WorkspaceProvisioningFailedError,
} from '../common/errors/sandbox-fact-error.js';
import { WorkspaceManager } from './workspace-manager.js';

const EXECUTION_ID = '11111111-1111-4111-8111-111111111111';

function fakeConfigService(
  overrides: Record<string, unknown> = {},
): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

const TEST_ACL_IDENTITIES = [...new Set([10001, process.getuid?.() ?? -1])];
const ACL_OUTPUT = [
  'user::rwx',
  ...TEST_ACL_IDENTITIES.filter(
    (uid) => uid !== (process.getuid?.() ?? -1),
  ).map((uid) => `user:${uid}:rwx`),
  'group::---',
  'mask::rwx',
  'other::---',
  'default:user::rwx',
  ...(process.getuid?.() === 10001
    ? []
    : TEST_ACL_IDENTITIES.map((uid) => `default:user:${uid}:rwx`)),
  'default:group::---',
  'default:mask::rwx',
  'default:other::---',
].join('\n');

class TestWorkspaceManager extends WorkspaceManager {
  readonly aclCalls: Array<{ command: string; args: string[] }> = [];
  commandFailure?: Error;
  verificationOutput = ACL_OUTPUT;
  removalFailure?: Error;
  aclEnabled = true;

  protected override usesAcl(): boolean {
    return this.aclEnabled;
  }

  protected override async runAclCommand(
    command: 'setfacl' | 'getfacl',
    args: string[],
  ): Promise<string> {
    this.aclCalls.push({ command, args });
    if (this.commandFailure) {
      throw this.commandFailure;
    }
    return command === 'getfacl' ? this.verificationOutput : '';
  }

  protected override async removeWorkspaceTree(
    workspacePath: string,
  ): Promise<void> {
    if (this.removalFailure) {
      throw this.removalFailure;
    }
    await super.removeWorkspaceTree(workspacePath);
  }
}

class LinuxAclManagerAsHost1000 extends WorkspaceManager {
  protected override getHostUid(): number {
    return 1000;
  }
}

describe('WorkspaceManager', () => {
  let root: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-manager-'));
    manager = new TestWorkspaceManager(
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
    const testManager = manager as TestWorkspaceManager;
    const expectedCalls: Array<{ command: string; args: string[] }> = [];
    if (process.getuid?.() !== 10001) {
      expectedCalls.push({
        command: 'setfacl',
        args: ['-m', 'u:10001:rwx,m:rwx', '--', workspacePath],
      });
    }
    expectedCalls.push(
      {
        command: 'setfacl',
        args: [
          '-d',
          '-m',
          [
            'u::rwx',
            ...(process.getuid?.() === 10001
              ? []
              : [`u:10001:rwx,u:${process.getuid?.()}:rwx`]),
            'g::---',
            'm::rwx',
            'o::---',
          ].join(','),
          '--',
          workspacePath,
        ],
      },
      {
        command: 'getfacl',
        args: ['-cpn', '--', workspacePath],
      },
    );
    expect(testManager.aclCalls).toEqual(expectedCalls);
    expect(
      testManager.aclCalls.flatMap(({ args }) => args).join(' '),
    ).not.toContain('777');
  });

  it('fails closed and removes the empty workspace when ACL setup fails', async () => {
    const testManager = manager as TestWorkspaceManager;
    testManager.commandFailure = Object.assign(new Error('setfacl missing'), {
      code: 'ENOENT',
    });

    await expect(manager.createWorkspace(EXECUTION_ID)).rejects.toThrow(
      /setfacl\/getfacl.*required/,
    );
    await expect(fs.stat(path.join(root, EXECUTION_ID))).rejects.toThrow();
  });

  it('classifies an ACL provisioning failure as INFRASTRUCTURE without paths', async () => {
    (manager as TestWorkspaceManager).commandFailure = Object.assign(
      new Error('setfacl missing'),
      { code: 'ENOENT' },
    );

    const error = await manager
      .createWorkspace(EXECUTION_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorkspaceProvisioningFailedError);
    expect(error).toMatchObject({
      code: 'WORKSPACE_PROVISIONING_FAILED',
      category: 'INFRASTRUCTURE',
    });
    expect((error as Error).message).not.toContain(root);
  });

  it('skips ACL provisioning and restoration on platforms without ACL support', async () => {
    const testManager = manager as TestWorkspaceManager;
    testManager.aclEnabled = false;
    testManager.commandFailure = new Error('must not be invoked');

    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    await manager.restoreHostAccess(workspacePath);

    expect(testManager.aclCalls).toEqual([]);
    expect((await fs.stat(workspacePath)).mode & 0o777).toBe(0o700);
  });

  it('fails closed when ACL verification does not include the runner and defaults', async () => {
    (manager as TestWorkspaceManager).verificationOutput =
      'user::rwx\nuser:10001:r-x\n';

    await expect(manager.createWorkspace(EXECUTION_ID)).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/ACL verification failed/),
      }),
    });
    await expect(fs.stat(path.join(root, EXECUTION_ID))).rejects.toThrow();
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

  it('reports cleanup failure without claiming an adversarial tree was removed', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    (manager as TestWorkspaceManager).removalFailure = Object.assign(
      new Error('EACCES: traversal denied after descendant chmod 0700'),
      { code: 'EACCES' },
    );

    await expect(manager.cleanup(workspacePath)).resolves.toBe(false);
    await expect(fs.stat(workspacePath)).resolves.toBeTruthy();
  });

  it('restores host ACLs recursively and verifies each changed entry', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    const testManager = manager as TestWorkspaceManager;
    testManager.aclCalls.length = 0;

    await manager.restoreHostAccess(workspacePath);

    expect(testManager.aclCalls).toEqual([
      {
        command: 'setfacl',
        args: ['-m', 'g::---,m:rwx,o::---', '--', workspacePath],
      },
      {
        command: 'getfacl',
        args: ['-cpn', '--', workspacePath],
      },
    ]);
  });

  it('rejects ACL restoration for paths outside the managed workspace root', async () => {
    await expect(manager.restoreHostAccess(root)).rejects.toThrow(
      InvalidArtifactPathError,
    );
  });

  it('sweeps directories older than the TTL and keeps recent ones', async () => {
    const oldId = '22222222-2222-4222-8222-222222222222';
    const freshId = '33333333-3333-4333-8333-333333333333';
    const ttlManager = new TestWorkspaceManager(
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

  it('calculates the recursive size of a directory tree', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    await fs.writeFile(path.join(workspacePath, 'a.txt'), Buffer.alloc(100));
    await fs.mkdir(path.join(workspacePath, 'nested'));
    await fs.writeFile(
      path.join(workspacePath, 'nested', 'b.txt'),
      Buffer.alloc(250),
    );

    await expect(manager.calculateDirectorySize(workspacePath)).resolves.toBe(
      350,
    );
  });

  it('does not follow symlinks when calculating directory size (no cycles)', async () => {
    const workspacePath = await manager.createWorkspace(EXECUTION_ID);
    await fs.writeFile(path.join(workspacePath, 'a.txt'), Buffer.alloc(100));
    // Un symlink que apunta al propio workspace formaría un ciclo si se siguiera.
    await fs.symlink(workspacePath, path.join(workspacePath, 'self-link'));

    await expect(manager.calculateDirectorySize(workspacePath)).resolves.toBe(
      100,
    );
  });

  it('returns 0 for a directory that no longer exists', async () => {
    await expect(
      manager.calculateDirectorySize(path.join(root, 'does-not-exist')),
    ).resolves.toBe(0);
  });

  it('does not report a TTL workspace as removed when recursive cleanup fails', async () => {
    const failedId = '44444444-4444-4444-8444-444444444444';
    const ttlManager = new TestWorkspaceManager(
      fakeConfigService({
        SANDBOX_WORKSPACE_ROOT: root,
        SANDBOX_WORKSPACE_TTL_MS: 1000,
      }),
    );
    const failedPath = await ttlManager.createWorkspace(failedId);
    const old = new Date(Date.now() - 10_000);
    await fs.utimes(failedPath, old, old);
    ttlManager.removalFailure = Object.assign(new Error('EACCES'), {
      code: 'EACCES',
    });

    await expect(ttlManager.sweepExpired()).resolves.toEqual([]);
    await expect(fs.stat(failedPath)).resolves.toBeTruthy();
  });

  it.skipIf(!hasLinuxAclTestPrerequisites())(
    'grants UID 10001 access and preserves host access to runner-created descendants',
    async () => {
      const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'workspace-acl-host-'),
      );
      // The orchestration process is root in this smoke, while UID 1000
      // represents a distinct, unprivileged API host identity.
      execFileSync('setfacl', ['-m', 'u:1000:rwx,m:rwx', '--', tempRoot]);
      const realManager = new LinuxAclManagerAsHost1000(
        fakeConfigService({ SANDBOX_WORKSPACE_ROOT: tempRoot }),
      );
      const workspacePath = await realManager.createWorkspace(
        '55555555-5555-4555-8555-555555555555',
      );
      try {
        const runAs = (uid: number, script: string) =>
          promisify(execFile)(
            'setpriv',
            [
              `--reuid=${uid}`,
              `--regid=${uid}`,
              '--clear-groups',
              '--',
              process.execPath,
              '-e',
              script,
              workspacePath,
            ],
            { encoding: 'utf8', timeout: 5_000 },
          );

        await expect(
          runAs(
            10001,
            "const fs=require('node:fs'); const p=process.argv[1]+'/nested'; fs.mkdirSync(p,{mode:0o777}); fs.writeFileSync(p+'/runner-file.txt','runner data',{mode:0o666});",
          ),
        ).resolves.toBeTruthy();
        await expect(
          runAs(
            1000,
            "const fs=require('node:fs'); const p=process.argv[1]+'/nested'; fs.readFileSync(p+'/runner-file.txt'); if(!fs.readdirSync(p).includes('runner-file.txt')) process.exit(2); fs.writeFileSync(p+'/host-file.txt','host data');",
          ),
        ).resolves.toBeTruthy();
        await expect(
          runAs(
            10001,
            "const fs=require('node:fs'); fs.readFileSync(process.argv[1]+'/nested/host-file.txt');",
          ),
        ).resolves.toBeTruthy();
        await expect(
          runAs(
            1000,
            "const fs=require('node:fs'); fs.rmSync(process.argv[1],{recursive:true});",
          ),
        ).resolves.toBeTruthy();
        await expect(fs.stat(workspacePath)).rejects.toThrow();
      } finally {
        await realManager.cleanup(workspacePath);
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!hasLinuxAclTestPrerequisites())(
    'restores host access after untrusted chmod without following symlinks',
    async () => {
      const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'workspace-acl-host-'),
      );
      execFileSync('setfacl', ['-m', 'u:1000:rwx,m:rwx', '--', tempRoot]);
      const realManager = new LinuxAclManagerAsHost1000(
        fakeConfigService({ SANDBOX_WORKSPACE_ROOT: tempRoot }),
      );
      const workspacePath = await realManager.createWorkspace(
        '66666666-6666-4666-8666-666666666666',
      );
      try {
        await promisify(execFile)(
          'setpriv',
          [
            '--reuid=10001',
            '--regid=10001',
            '--clear-groups',
            '--',
            process.execPath,
            '-e',
            "const fs=require('node:fs'); const p=process.argv[1]+'/locked'; fs.mkdirSync(p,{mode:0o777}); fs.writeFileSync(p+'/private.txt','readable',{mode:0o666}); fs.chmodSync(p,0o700); fs.chmodSync(p+'/private.txt',0o600);",
            workspacePath,
          ],
          { encoding: 'utf8', timeout: 5_000 },
        );

        await realManager.restoreHostAccess(workspacePath);
        const directoryAcl = execFileSync(
          'getfacl',
          ['-cpn', '--', path.join(workspacePath, 'locked')],
          { encoding: 'utf8' },
        );
        expect(directoryAcl).toMatch(/^user:1000:rwx$/m);
        expect(directoryAcl).toMatch(/^mask::rwx$/m);
        const fileAcl = execFileSync(
          'getfacl',
          ['-cpn', '--', path.join(workspacePath, 'locked', 'private.txt')],
          { encoding: 'utf8' },
        );
        expect(fileAcl).toMatch(/^user:1000:r--$/m);
        expect(fileAcl).toMatch(/^mask::r--$/m);

        const hostReadAndWrite = await promisify(execFile)(
          'setpriv',
          [
            '--reuid=1000',
            '--regid=1000',
            '--clear-groups',
            '--',
            process.execPath,
            '-e',
            "const fs=require('node:fs'); const f=process.argv[1]+'/locked/private.txt'; if(fs.readFileSync(f,'utf8')!=='readable') process.exit(2); try { fs.writeFileSync(f,'changed'); process.exit(3); } catch(e) { if(e.code!=='EACCES') throw e; } fs.unlinkSync(f);",
            workspacePath,
          ],
          { encoding: 'utf8', timeout: 5_000 },
        );
        expect(hostReadAndWrite.stdout).toBe('');
        await expect(
          promisify(execFile)(
            'setpriv',
            [
              '--reuid=1000',
              '--regid=1000',
              '--clear-groups',
              '--',
              process.execPath,
              '-e',
              "require('node:fs').rmdirSync(process.argv[1]+'/locked')",
              workspacePath,
            ],
            { encoding: 'utf8', timeout: 5_000 },
          ),
        ).resolves.toBeTruthy();
        await expect(fs.stat(path.join(workspacePath, 'locked'))).rejects.toThrow();
      } finally {
        await realManager.cleanup(workspacePath);
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    },
  );
});

function hasLinuxAclTestPrerequisites(): boolean {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') {
    return false;
  }
  try {
    execFileSync('setfacl', ['--version'], { stdio: 'ignore' });
    execFileSync('getfacl', ['--version'], { stdio: 'ignore' });
    execFileSync('setpriv', ['--version'], { stdio: 'ignore' });
    return process.getuid() === 0;
  } catch {
    return false;
  }
}
