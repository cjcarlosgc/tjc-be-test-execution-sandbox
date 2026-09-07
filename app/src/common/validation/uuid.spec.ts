import { describe, expect, it } from 'vitest';
import { isUuid } from './uuid.js';

describe('isUuid', () => {
  it('accepts a v4 UUID', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('accepts a v5 UUID (Core-derived Idempotency-Key)', () => {
    expect(isUuid('886313e1-3b8a-5372-9b90-0c9aee199e5d')).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('11111111-1111-4111-8111-11111111111')).toBe(false);
  });
});
