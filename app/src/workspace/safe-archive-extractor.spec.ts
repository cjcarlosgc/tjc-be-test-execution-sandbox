import type { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import { InvalidArchiveError } from '../common/errors/sandbox-fact-error.js';
import { SafeArchiveExtractor } from './safe-archive-extractor.js';

const SYMLINK_MODE = 0o120777;

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

/**
 * yazl valida y rechaza nombres de entrada peligrosos (`..`, rutas
 * absolutas) al construir el ZIP, así que para fixtures maliciosas se
 * escribe un nombre inocuo de igual longitud y se parchea el buffer
 * resultante byte a byte, preservando offsets/CRC del formato ZIP.
 */
function patchEntryName(buffer: Buffer, placeholder: string, malicious: string): Buffer {
  if (placeholder.length !== malicious.length) {
    throw new Error('placeholder and malicious names must have equal length');
  }
  const needle = Buffer.from(placeholder, 'utf8');
  const replacement = Buffer.from(malicious, 'utf8');
  const patched = Buffer.from(buffer);
  let index = patched.indexOf(needle);
  while (index !== -1) {
    replacement.copy(patched, index);
    index = patched.indexOf(needle, index + replacement.length);
  }
  return patched;
}

function buildZip(
  entries: Array<{ path: string; content?: string; mode?: number }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    for (const entry of entries) {
      zip.addBuffer(
        Buffer.from(entry.content ?? 'content', 'utf8'),
        entry.path,
        entry.mode ? { mode: entry.mode } : undefined,
      );
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

describe('SafeArchiveExtractor', () => {
  let tmpDir: string;
  let zipPath: string;
  let destination: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-extract-'));
    zipPath = path.join(tmpDir, 'input.zip');
    destination = path.join(tmpDir, 'workspace');
    await fs.mkdir(destination, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('extracts nested files preserving structure', async () => {
    const buffer = await buildZip([
      { path: 'package.json', content: '{"name":"demo"}' },
      { path: 'src/index.ts', content: 'export const x = 1;' },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await extractor.extract(zipPath, destination);

    expect(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).toBe(
      '{"name":"demo"}',
    );
    expect(
      await fs.readFile(path.join(destination, 'src', 'index.ts'), 'utf8'),
    ).toBe('export const x = 1;');
  });

  it('flattens a single top-level containing folder so the project lands at the workspace root', async () => {
    const buffer = await buildZip([
      { path: 'my-project/package.json', content: '{"name":"demo"}' },
      { path: 'my-project/src/index.ts', content: 'export const x = 1;' },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await extractor.extract(zipPath, destination);

    expect(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).toBe(
      '{"name":"demo"}',
    );
    expect(
      await fs.readFile(path.join(destination, 'src', 'index.ts'), 'utf8'),
    ).toBe('export const x = 1;');
    await expect(
      fs.access(path.join(destination, 'my-project')),
    ).rejects.toThrow();
  });

  it('does not flatten when there are multiple top-level entries', async () => {
    const buffer = await buildZip([
      { path: 'package.json', content: '{"name":"demo"}' },
      { path: 'README.md', content: 'hello' },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await extractor.extract(zipPath, destination);

    expect(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).toBe(
      '{"name":"demo"}',
    );
    expect(await fs.readFile(path.join(destination, 'README.md'), 'utf8')).toBe(
      'hello',
    );
  });

  it('does not flatten a single top-level file', async () => {
    const buffer = await buildZip([{ path: 'package.json', content: '{}' }]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await extractor.extract(zipPath, destination);

    expect(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).toBe(
      '{}',
    );
  });

  it('rejects a Zip Slip entry that escapes the destination', async () => {
    const raw = await buildZip([{ path: 'zzzescape.txt' }]);
    const buffer = patchEntryName(raw, 'zzzescape.txt', '../escape.txt');
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await expect(extractor.extract(zipPath, destination)).rejects.toThrow();
  });

  it('rejects an absolute entry path', async () => {
    const raw = await buildZip([{ path: 'aaaaaaaaaaa' }]);
    const buffer = patchEntryName(raw, 'aaaaaaaaaaa', '/etc/passwd');
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await expect(extractor.extract(zipPath, destination)).rejects.toThrow();
  });

  it('rejects a symlink entry', async () => {
    const buffer = await buildZip([
      { path: 'evil-link', content: '/etc/passwd', mode: SYMLINK_MODE },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(fakeConfigService());
    await expect(extractor.extract(zipPath, destination)).rejects.toThrow(
      InvalidArchiveError,
    );
  });

  it('rejects an archive exceeding the configured entry count', async () => {
    const buffer = await buildZip([
      { path: 'a.txt' },
      { path: 'b.txt' },
      { path: 'c.txt' },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(
      fakeConfigService({ SANDBOX_MAX_ZIP_ENTRIES: 2 }),
    );
    await expect(extractor.extract(zipPath, destination)).rejects.toThrow(
      InvalidArchiveError,
    );
  });

  it('rejects an entry larger than the configured per-entry limit', async () => {
    const buffer = await buildZip([
      { path: 'big.txt', content: 'x'.repeat(1000) },
    ]);
    await fs.writeFile(zipPath, buffer);

    const extractor = new SafeArchiveExtractor(
      fakeConfigService({ SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES: 10 }),
    );
    await expect(extractor.extract(zipPath, destination)).rejects.toThrow(
      InvalidArchiveError,
    );
  });
});
