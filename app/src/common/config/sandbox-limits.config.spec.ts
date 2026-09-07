import type { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSandboxLimits } from './sandbox-limits.config.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('resolveSandboxLimits', () => {
  it('falls back to the OS temp default when SANDBOX_WORKSPACE_ROOT is absent', () => {
    const limits = resolveSandboxLimits(fakeConfigService());
    expect(limits.workspaceRoot).toBe(
      path.join(os.tmpdir(), 'tjc-sandbox-workspaces'),
    );
  });

  it('falls back to the OS temp default when SANDBOX_WORKSPACE_ROOT is set but empty', () => {
    // dotenv/.env.example document "leave empty for the default" — an env var
    // present with an empty string is NOT the same as an absent key for
    // ConfigService.get's own default-value substitution, so this must be
    // handled explicitly or the workspace root silently resolves to ''.
    const limits = resolveSandboxLimits(
      fakeConfigService({ SANDBOX_WORKSPACE_ROOT: '' }),
    );
    expect(limits.workspaceRoot).toBe(
      path.join(os.tmpdir(), 'tjc-sandbox-workspaces'),
    );
  });

  it('uses an explicitly configured SANDBOX_WORKSPACE_ROOT', () => {
    const limits = resolveSandboxLimits(
      fakeConfigService({ SANDBOX_WORKSPACE_ROOT: '/var/data/sandbox' }),
    );
    expect(limits.workspaceRoot).toBe('/var/data/sandbox');
  });
});
