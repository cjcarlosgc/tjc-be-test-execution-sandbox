import { describe, expect, it } from 'vitest';
import { validateSandboxEnv } from './env.validation.js';

describe('validateSandboxEnv', () => {
  it('acepta un entorno vacío, valores vacíos y valores válidos', () => {
    expect(() => validateSandboxEnv({})).not.toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_POLL_AFTER_MS: '', PORT: '3001', SANDBOX_DOWNLOAD_MAX_RETRIES: '0', SANDBOX_MAX_CONCURRENT_EXECUTIONS: '2' })).not.toThrow();
  });

  it('rechaza un número mal escrito en lugar de usar el valor por defecto en silencio', () => {
    expect(() => validateSandboxEnv({ SANDBOX_CONTAINER_MEMORY_BYTES: '1gb' })).toThrow(/SANDBOX_CONTAINER_MEMORY_BYTES/);
  });

  it('lista todos los problemas a la vez', () => {
    let message = '';
    try {
      validateSandboxEnv({ PORT: '70000', SANDBOX_TEST_TIMEOUT_MS: '-1', SANDBOX_RECONCILE_ORPHANS_ON_START: 'si' });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const key of ['PORT', 'SANDBOX_TEST_TIMEOUT_MS', 'SANDBOX_RECONCILE_ORPHANS_ON_START']) expect(message).toContain(key);
  });

  it('exige enteros positivos en los límites y permite 0 solo donde tiene sentido', () => {
    expect(() => validateSandboxEnv({ SANDBOX_MAX_CONCURRENT_EXECUTIONS: '0' })).toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_DOWNLOAD_MAX_REDIRECTS: '0' })).not.toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_POLL_AFTER_MS: '1.5' })).toThrow();
  });
});
