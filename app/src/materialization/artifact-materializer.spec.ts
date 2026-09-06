import type { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionArtifactInput } from '../common/contracts/sandbox-execution.contract.js';
import type {
  DownloadedFile,
  ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { ArtifactMaterializer } from './artifact-materializer.js';

const EXECUTION_ID = '11111111-1111-4111-8111-111111111111';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

function artifact(
  artifactId: string,
  relativePath: string,
): ExecutionArtifactInput {
  return {
    artifactId,
    relativePath,
    artifactType: 'CREATED',
    download: {
      role: 'GENERATED_ARTIFACT',
      url: `https://storage.example.com/${artifactId}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
      sha256: 'a'.repeat(64),
      sizeBytes: 4,
    },
  };
}

/** Escribe un contenido fijo en destinationPath, simulando una descarga exitosa sin red. */
function stubDownloadService(content: string): ExecutionInputDownloadService {
  return {
    async downloadToFile(_ref, destinationPath): Promise<DownloadedFile> {
      await fs.writeFile(destinationPath, content, 'utf8');
      return { path: destinationPath, sizeBytes: content.length, sha256: 'stub' };
    },
  };
}

describe('ArtifactMaterializer', () => {
  let root: string;
  let workspaceManager: WorkspaceManager;
  let workspacePath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'materializer-'));
    workspaceManager = new WorkspaceManager(
      fakeConfigService({ SANDBOX_WORKSPACE_ROOT: root }),
    );
    workspacePath = await workspaceManager.createWorkspace(EXECUTION_ID);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes each artifact at its relative path, creating parent directories', async () => {
    const materializer = new ArtifactMaterializer(
      workspaceManager,
      stubDownloadService('generated content'),
    );

    const applied = await materializer.applyArtifacts(workspacePath, [
      artifact('a1', 'src/foo.spec.ts'),
      artifact('a2', 'nested/dir/bar.spec.ts'),
    ]);

    expect(applied).toEqual(['a1', 'a2']);
    expect(
      await fs.readFile(path.join(workspacePath, 'src', 'foo.spec.ts'), 'utf8'),
    ).toBe('generated content');
    expect(
      await fs.readFile(
        path.join(workspacePath, 'nested', 'dir', 'bar.spec.ts'),
        'utf8',
      ),
    ).toBe('generated content');
  });

  it('rejects an artifact whose relativePath escapes the workspace', async () => {
    const materializer = new ArtifactMaterializer(
      workspaceManager,
      stubDownloadService('x'),
    );

    await expect(
      materializer.applyArtifacts(workspacePath, [
        artifact('a1', '../outside.ts'),
      ]),
    ).rejects.toThrow();
  });

  it('overwrites an existing file for a MODIFIED artifact', async () => {
    const target = path.join(workspacePath, 'src', 'existing.ts');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'original content', 'utf8');

    const materializer = new ArtifactMaterializer(
      workspaceManager,
      stubDownloadService('modified content'),
    );
    const modifiedArtifact = {
      ...artifact('a1', 'src/existing.ts'),
      artifactType: 'MODIFIED' as const,
    };

    await materializer.applyArtifacts(workspacePath, [modifiedArtifact]);

    expect(await fs.readFile(target, 'utf8')).toBe('modified content');
  });

  it('applies an empty artifact list as a no-op', async () => {
    const materializer = new ArtifactMaterializer(
      workspaceManager,
      stubDownloadService('x'),
    );

    await expect(
      materializer.applyArtifacts(workspacePath, []),
    ).resolves.toEqual([]);
  });
});
