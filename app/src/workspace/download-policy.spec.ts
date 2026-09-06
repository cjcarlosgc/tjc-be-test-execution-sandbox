import { describe, expect, it } from 'vitest';
import type { EphemeralDownloadRef } from '../common/contracts/sandbox-execution.contract.js';
import {
  InputDownloadFailedError,
  InputUrlExpiredError,
} from '../common/errors/sandbox-fact-error.js';
import { assertDownloadPolicy } from './download-policy.js';

function ref(overrides: Partial<EphemeralDownloadRef> = {}): EphemeralDownloadRef {
  return {
    role: 'PROJECT_SNAPSHOT',
    url: 'https://storage.example.com/snapshot.zip',
    expiresAt: '2026-01-01T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    sizeBytes: 10,
    ...overrides,
  };
}

const NOW = new Date('2025-12-01T00:00:00.000Z');

describe('assertDownloadPolicy', () => {
  it('accepts an https URL on an allowed host that has not expired', () => {
    const url = assertDownloadPolicy(ref(), ['storage.example.com'], NOW);
    expect(url.hostname).toBe('storage.example.com');
  });

  it('rejects a non-https URL', () => {
    expect(() =>
      assertDownloadPolicy(
        ref({ url: 'http://storage.example.com/snapshot.zip' }),
        ['storage.example.com'],
        NOW,
      ),
    ).toThrow(InputDownloadFailedError);
  });

  it('rejects a host outside the allowlist', () => {
    expect(() =>
      assertDownloadPolicy(ref(), ['other.example.com'], NOW),
    ).toThrow(InputDownloadFailedError);
  });

  it('rejects an empty allowlist (fail closed)', () => {
    expect(() => assertDownloadPolicy(ref(), [], NOW)).toThrow(
      InputDownloadFailedError,
    );
  });

  it('rejects an expired reference', () => {
    expect(() =>
      assertDownloadPolicy(
        ref({ expiresAt: '2025-11-01T00:00:00.000Z' }),
        ['storage.example.com'],
        NOW,
      ),
    ).toThrow(InputUrlExpiredError);
  });

  it('rejects a malformed URL', () => {
    expect(() =>
      assertDownloadPolicy(
        ref({ url: 'not-a-url' }),
        ['storage.example.com'],
        NOW,
      ),
    ).toThrow(InputDownloadFailedError);
  });
});
