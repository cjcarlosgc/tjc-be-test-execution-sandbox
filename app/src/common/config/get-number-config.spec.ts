import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { getNumberConfig } from './get-number-config.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string) => overrides[key],
  } as unknown as ConfigService;
}

describe('getNumberConfig', () => {
  it('returns the default when the key is absent', () => {
    expect(getNumberConfig(fakeConfigService(), 'X', 42)).toBe(42);
  });

  it('returns the default when the value is an empty string (.env var declared but blank)', () => {
    expect(getNumberConfig(fakeConfigService({ X: '' }), 'X', 42)).toBe(42);
  });

  it('coerces a numeric string coming from a real environment/.env value', () => {
    expect(getNumberConfig(fakeConfigService({ X: '268435456' }), 'X', 0)).toBe(
      268435456,
    );
  });

  it('passes through a literal number (as used by unit test fakes)', () => {
    expect(getNumberConfig(fakeConfigService({ X: 7 }), 'X', 0)).toBe(7);
  });

  it('returns the default when the value is not a valid number', () => {
    expect(getNumberConfig(fakeConfigService({ X: 'not-a-number' }), 'X', 42)).toBe(
      42,
    );
  });
});
