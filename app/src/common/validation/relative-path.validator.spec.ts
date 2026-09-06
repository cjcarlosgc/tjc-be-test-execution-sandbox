import { describe, expect, it } from 'vitest';
import { IsRelativePathConstraint } from './relative-path.validator.js';

describe('IsRelativePathConstraint', () => {
  const constraint = new IsRelativePathConstraint();

  it.each([
    'src/foo.spec.ts',
    'a/b/c.ts',
    'index.ts',
  ])('accepts normalized relative path %s', (value) => {
    expect(constraint.validate(value)).toBe(true);
  });

  it.each([
    '/etc/passwd',
    '../secret.ts',
    'src/../../secret.ts',
    'C:\\Windows\\system.ts',
    '\\\\network\\share',
    '',
    './src/foo.ts',
  ])('rejects unsafe or non-normalized path %s', (value) => {
    expect(constraint.validate(value)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(constraint.validate(123)).toBe(false);
    expect(constraint.validate(null)).toBe(false);
    expect(constraint.validate(undefined)).toBe(false);
  });
});
