import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveProjectRoot } from './project-root-resolver.js';

describe('resolveProjectRoot', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'project-root-resolver-'),
    );
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('resolves to the single top-level containing folder without moving anything', async () => {
    await fs.mkdir(path.join(workspacePath, 'my-project', 'src'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(workspacePath, 'my-project', 'package.json'),
      '{}',
    );

    const projectRoot = await resolveProjectRoot(workspacePath);

    expect(projectRoot).toBe(path.join(workspacePath, 'my-project'));
    // No debe haber movido nada: el archivo sigue donde la extracción lo dejó.
    await expect(
      fs.access(path.join(workspacePath, 'my-project', 'package.json')),
    ).resolves.toBeUndefined();
  });

  it('resolves to the workspace root itself when there are multiple top-level entries', async () => {
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}');
    await fs.writeFile(path.join(workspacePath, 'README.md'), 'hello');

    await expect(resolveProjectRoot(workspacePath)).resolves.toBe(
      workspacePath,
    );
  });

  it('resolves to the workspace root itself when the single top-level entry is a file', async () => {
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}');

    await expect(resolveProjectRoot(workspacePath)).resolves.toBe(
      workspacePath,
    );
  });

  it('resolves to the workspace root itself for an empty workspace', async () => {
    await expect(resolveProjectRoot(workspacePath)).resolves.toBe(
      workspacePath,
    );
  });
});
