import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceManager } from './workspace-manager.js';
import { WorkspaceSweeperService } from './workspace-sweeper.service.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('WorkspaceSweeperService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs sweepExpired and logs how many workspaces were removed', async () => {
    const sweepExpired = vi.fn(async () => ['/tmp/a', '/tmp/b']);
    const workspaceManager = { sweepExpired } as unknown as WorkspaceManager;
    const service = new WorkspaceSweeperService(
      workspaceManager,
      fakeConfigService(),
    );

    const removed = await service.sweep();

    expect(removed).toEqual(['/tmp/a', '/tmp/b']);
    expect(sweepExpired).toHaveBeenCalledTimes(1);
  });

  it('never throws when sweepExpired rejects', async () => {
    const workspaceManager = {
      sweepExpired: vi.fn(async () => {
        throw new Error('disk unreadable');
      }),
    } as unknown as WorkspaceManager;
    const service = new WorkspaceSweeperService(
      workspaceManager,
      fakeConfigService(),
    );

    await expect(service.sweep()).resolves.toEqual([]);
  });

  it('schedules sweep() on the configured interval and stops on destroy', async () => {
    vi.useFakeTimers();
    const sweepExpired = vi.fn(async () => []);
    const workspaceManager = { sweepExpired } as unknown as WorkspaceManager;
    const service = new WorkspaceSweeperService(
      workspaceManager,
      fakeConfigService({ SANDBOX_SWEEPER_INTERVAL_MS: 1000 }),
    );

    service.onModuleInit();

    await vi.advanceTimersByTimeAsync(1000);
    expect(sweepExpired).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(sweepExpired).toHaveBeenCalledTimes(3);

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sweepExpired).toHaveBeenCalledTimes(3);
  });
});
