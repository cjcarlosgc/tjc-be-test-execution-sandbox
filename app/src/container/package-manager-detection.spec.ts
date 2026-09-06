import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasPnpmLockfile } from './package-manager-detection.js';

describe('hasPnpmLockfile', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-detect-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('returns true when pnpm-lock.yaml exists', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    );
    await expect(hasPnpmLockfile(workspacePath)).resolves.toBe(true);
  });

  it('returns false when there is no pnpm-lock.yaml', async () => {
    await fs.writeFile(
      path.join(workspacePath, 'package-lock.json'),
      '{}',
    );
    await expect(hasPnpmLockfile(workspacePath)).resolves.toBe(false);
  });
});
