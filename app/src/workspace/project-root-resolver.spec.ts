import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveProjectRoot } from './project-root-resolver.js';

describe('resolveProjectRoot', () => {
  let repositoryRoot: string;
  let outsideRoot: string;

  beforeEach(async () => {
    repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'project-root-resolver-'));
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-root-'));
    await fs.mkdir(path.join(repositoryRoot, 'apps', 'api'), { recursive: true });
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(repositoryRoot, { recursive: true, force: true }),
      fs.rm(outsideRoot, { recursive: true, force: true }),
    ]);
  });

  it('uses the legacy repository root when projectRoot is omitted or explicit .', async () => {
    const expected = path.resolve(repositoryRoot);
    await expect(resolveProjectRoot(repositoryRoot)).resolves.toBe(expected);
    await expect(resolveProjectRoot(repositoryRoot, '.')).resolves.toBe(expected);
  });

  it('resolves the exact nested path sent by Core without detecting candidates', async () => {
    await expect(resolveProjectRoot(repositoryRoot, 'apps/api')).resolves.toBe(
      path.join(repositoryRoot, 'apps', 'api'),
    );
  });

  it.each(['../outside', 'apps/../api', '/tmp/project', 'apps//api', 'apps/./api', 'apps\\api'])(
    'rejects a non-normalized or absolute projectRoot: %s',
    async (projectRoot) => {
      await expect(resolveProjectRoot(repositoryRoot, projectRoot)).rejects.toThrow(
        /projectRoot must be/,
      );
    },
  );

  it('rejects a missing projectRoot before any runner can execute', async () => {
    await expect(resolveProjectRoot(repositoryRoot, 'apps/missing')).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rejects a projectRoot symlink that escapes repositoryRoot', async () => {
    await fs.symlink(outsideRoot, path.join(repositoryRoot, 'apps', 'escape'));
    await expect(resolveProjectRoot(repositoryRoot, 'apps/escape')).rejects.toThrow(
      /escapes repositoryRoot through a symlink/,
    );
  });

  it('allows a symlink only when its resolved directory remains inside repositoryRoot', async () => {
    await fs.symlink(
      path.join(repositoryRoot, 'apps', 'api'),
      path.join(repositoryRoot, 'apps', 'api-link'),
    );
    await expect(resolveProjectRoot(repositoryRoot, 'apps/api-link')).resolves.toBe(
      path.join(repositoryRoot, 'apps', 'api-link'),
    );
  });
});
