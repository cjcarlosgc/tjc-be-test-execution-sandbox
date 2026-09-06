import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputDownloadFailedError } from '../common/errors/sandbox-fact-error.js';
import { streamToFileWithLimit } from './stream-to-file.js';

describe('streamToFileWithLimit', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-to-file-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the content and returns matching size/sha256', async () => {
    const content = Buffer.from('hello sandbox');
    const destination = path.join(tmpDir, 'out.bin');

    const result = await streamToFileWithLimit(
      Readable.from(content),
      destination,
      1024,
    );

    expect(result.sizeBytes).toBe(content.length);
    expect(result.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect((await fs.readFile(destination)).equals(content)).toBe(true);
  });

  it('aborts once the stream exceeds maxBytes', async () => {
    const content = Buffer.alloc(2048, 'x');
    const destination = path.join(tmpDir, 'too-big.bin');

    await expect(
      streamToFileWithLimit(Readable.from(content), destination, 1024),
    ).rejects.toThrow(InputDownloadFailedError);
  });
});
