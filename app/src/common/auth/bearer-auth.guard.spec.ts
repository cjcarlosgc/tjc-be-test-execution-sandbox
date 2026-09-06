import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BearerAuthGuard } from './bearer-auth.guard.js';

const SERVICE_TOKEN = 'super-secret-service-token';

function contextWithAuthHeader(header: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name.toLowerCase() === 'authorization' ? header : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function fakeConfigService(token: string | undefined): ConfigService {
  return {
    get: () => token,
  } as unknown as ConfigService;
}

describe('BearerAuthGuard', () => {
  it('allows a request with the exact configured bearer token', () => {
    const guard = new BearerAuthGuard(fakeConfigService(SERVICE_TOKEN));
    const context = contextWithAuthHeader(`Bearer ${SERVICE_TOKEN}`);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    const guard = new BearerAuthGuard(fakeConfigService(SERVICE_TOKEN));
    const context = contextWithAuthHeader(undefined);

    expect(() => guard.canActivate(context)).toThrowError(/UNAUTHORIZED|Authorization/);
  });

  it('rejects a header without the Bearer prefix', () => {
    const guard = new BearerAuthGuard(fakeConfigService(SERVICE_TOKEN));
    const context = contextWithAuthHeader(SERVICE_TOKEN);

    expect(() => guard.canActivate(context)).toThrowError(/UNAUTHORIZED|Authorization/);
  });

  it('rejects an incorrect token', () => {
    const guard = new BearerAuthGuard(fakeConfigService(SERVICE_TOKEN));
    const context = contextWithAuthHeader('Bearer wrong-token');

    expect(() => guard.canActivate(context)).toThrowError(/UNAUTHORIZED|Invalid/);
  });

  it('rejects any token when no service token is configured', () => {
    const guard = new BearerAuthGuard(fakeConfigService(undefined));
    const context = contextWithAuthHeader(`Bearer ${SERVICE_TOKEN}`);

    expect(() => guard.canActivate(context)).toThrowError(/UNAUTHORIZED|Invalid/);
  });
});
