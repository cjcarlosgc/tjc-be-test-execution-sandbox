import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EphemeralDownloadRef } from '../common/contracts/sandbox-execution.contract.js';
import { IntegrityCheckFailedError } from '../common/errors/sandbox-fact-error.js';
import {
  HttpExecutionInputDownloadService,
  type FetchLike,
} from './execution-input-download.service.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

function bodyResponse(
  content: Buffer,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const webStream = Readable.toWeb(
    Readable.from(content),
  ) as unknown as ReadableStream;
  return new Response(webStream, {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

function refFor(content: Buffer, overrides: Partial<EphemeralDownloadRef> = {}): EphemeralDownloadRef {
  return {
    role: 'PROJECT_SNAPSHOT',
    url: 'https://storage.example.com/file.bin',
    expiresAt: '2099-01-01T00:00:00.000Z',
    sha256: createHash('sha256').update(content).digest('hex'),
    sizeBytes: content.length,
    ...overrides,
  };
}

describe('HttpExecutionInputDownloadService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'download-service-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function buildService(
    fetchFn: FetchLike,
    configOverrides: Record<string, unknown> = {},
  ): HttpExecutionInputDownloadService {
    return new HttpExecutionInputDownloadService(
      fakeConfigService({
        SANDBOX_ALLOWED_DOWNLOAD_HOSTS: 'storage.example.com',
        SANDBOX_DOWNLOAD_MAX_RETRIES: 1,
        ...configOverrides,
      }),
      fetchFn,
    );
  }

  it('downloads content that matches the declared sha256/sizeBytes', async () => {
    const content = Buffer.from('hello world');
    const fetchFn = vi.fn(async () => bodyResponse(content)) as unknown as FetchLike;
    const service = buildService(fetchFn);
    const destination = path.join(tmpDir, 'out.bin');

    const result = await service.downloadToFile(refFor(content), destination);

    expect(result.sizeBytes).toBe(content.length);
    expect((await fs.readFile(destination)).equals(content)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws IntegrityCheckFailedError without retrying when content does not match', async () => {
    const content = Buffer.from('hello world');
    const fetchFn = vi.fn(async () => bodyResponse(content)) as unknown as FetchLike;
    const service = buildService(fetchFn);
    const destination = path.join(tmpDir, 'out.bin');
    const badRef = refFor(content, { sha256: 'f'.repeat(64) });

    await expect(service.downloadToFile(badRef, destination)).rejects.toThrow(
      IntegrityCheckFailedError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries once on a transient failure and then succeeds', async () => {
    const content = Buffer.from('retry me');
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('ECONNRESET');
      }
      return bodyResponse(content);
    }) as unknown as FetchLike;
    const service = buildService(fetchFn);
    const destination = path.join(tmpDir, 'out.bin');

    const result = await service.downloadToFile(refFor(content), destination);

    expect(result.sizeBytes).toBe(content.length);
    expect(calls).toBe(2);
  });

  it('follows a redirect to an allowed host', async () => {
    const content = Buffer.from('redirected');
    const fetchFn = vi.fn(async (input: URL | string) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://storage.example.com/file.bin') {
        return bodyResponse(Buffer.alloc(0), {
          status: 302,
          headers: { location: 'https://storage.example.com/redirected.bin' },
        });
      }
      return bodyResponse(content);
    }) as unknown as FetchLike;
    const service = buildService(fetchFn);
    const destination = path.join(tmpDir, 'out.bin');

    const result = await service.downloadToFile(refFor(content), destination);

    expect(result.sizeBytes).toBe(content.length);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect to a host outside the allowlist', async () => {
    const fetchFn = vi.fn(async () =>
      bodyResponse(Buffer.alloc(0), {
        status: 302,
        headers: { location: 'https://evil.example.com/redirected.bin' },
      }),
    ) as unknown as FetchLike;
    const service = buildService(fetchFn);
    const destination = path.join(tmpDir, 'out.bin');

    await expect(
      service.downloadToFile(refFor(Buffer.from('x')), destination),
    ).rejects.toThrow();
  });
});
