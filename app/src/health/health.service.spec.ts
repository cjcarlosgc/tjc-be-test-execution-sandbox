import type { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

function fakeDocker(ping: () => Promise<void>) {
  return { ping } as unknown as import('dockerode');
}

describe('HealthService', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'health-'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('reports live status without checking any dependency', () => {
    const service = new HealthService(
      fakeDocker(async () => {
        throw new Error('should never be called by live()');
      }),
      fakeConfigService(),
    );

    const result = service.live();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeTruthy();
  });

  it('reports ready when Docker, download policy and workspace are all fine', async () => {
    const service = new HealthService(
      fakeDocker(async () => {}),
      fakeConfigService({
        SANDBOX_ALLOWED_DOWNLOAD_HOSTS: 'storage.example.com',
        SANDBOX_WORKSPACE_ROOT: workspaceRoot,
      }),
    );

    const result = await service.ready();

    expect(result.status).toBe('ready');
    expect(result.checks.docker.status).toBe('ok');
    expect(result.checks.downloadPolicy.status).toBe('ok');
    expect(result.checks.workspace.status).toBe('ok');
  });

  it('reports not_ready when Docker is unreachable', async () => {
    const service = new HealthService(
      fakeDocker(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
      fakeConfigService({
        SANDBOX_ALLOWED_DOWNLOAD_HOSTS: 'storage.example.com',
        SANDBOX_WORKSPACE_ROOT: workspaceRoot,
      }),
    );

    const result = await service.ready();

    expect(result.status).toBe('not_ready');
    expect(result.checks.docker.status).toBe('unavailable');
    expect(result.checks.docker.message).not.toContain('ECONNREFUSED');
  });

  it('reports not_ready when no download host is allowed', async () => {
    const service = new HealthService(
      fakeDocker(async () => {}),
      fakeConfigService({
        SANDBOX_ALLOWED_DOWNLOAD_HOSTS: '',
        SANDBOX_WORKSPACE_ROOT: workspaceRoot,
      }),
    );

    const result = await service.ready();

    expect(result.status).toBe('not_ready');
    expect(result.checks.downloadPolicy.status).toBe('unavailable');
  });
});
