import { Matches, ValidationOptions } from 'class-validator';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function IsSha256(options?: ValidationOptions) {
  return Matches(SHA256_PATTERN, {
    ...options,
    message: options?.message ?? 'must be a 64-character lowercase hex sha256',
  });
}
