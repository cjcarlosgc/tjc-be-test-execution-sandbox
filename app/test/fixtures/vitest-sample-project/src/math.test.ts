import { describe, expect, it } from 'vitest';
import { add } from './math.js';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
