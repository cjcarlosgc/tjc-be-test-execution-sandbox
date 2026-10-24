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

  it('SANDBOX_MAX_CONCURRENT_EXECUTIONS: rechaza -1, 1.5 y abc; acepta 2 y ausencia', () => {
    for (const raw of ['-1', '1.5', 'abc']) {
      expect(() => validateSandboxEnv({ SANDBOX_MAX_CONCURRENT_EXECUTIONS: raw })).toThrow(/SANDBOX_MAX_CONCURRENT_EXECUTIONS/);
    }
    expect(() => validateSandboxEnv({ SANDBOX_MAX_CONCURRENT_EXECUTIONS: '2' })).not.toThrow();
    expect(() => validateSandboxEnv({})).not.toThrow();
  });

  it('exige enteros positivos en los límites y permite 0 solo donde tiene sentido', () => {
    expect(() => validateSandboxEnv({ SANDBOX_MAX_CONCURRENT_EXECUTIONS: '0' })).toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_DOWNLOAD_MAX_REDIRECTS: '0' })).not.toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_POLL_AFTER_MS: '1.5' })).toThrow();
  });

  it('acepta SANDBOX_EXECUTION_STATE_DIR ausente, vacío o como ruta absoluta', () => {
    expect(() => validateSandboxEnv({})).not.toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_EXECUTION_STATE_DIR: '' })).not.toThrow();
    expect(() => validateSandboxEnv({ SANDBOX_EXECUTION_STATE_DIR: '/var/lib/tjc-sandbox/executions' })).not.toThrow();
  });

  it('rechaza SANDBOX_EXECUTION_STATE_DIR relativa en lugar de resolverla contra el cwd', () => {
    expect(() => validateSandboxEnv({ SANDBOX_EXECUTION_STATE_DIR: 'data/executions' })).toThrow(/SANDBOX_EXECUTION_STATE_DIR debe ser una ruta absoluta/);
    expect(() => validateSandboxEnv({ SANDBOX_EXECUTION_STATE_DIR: './executions' })).toThrow(/SANDBOX_EXECUTION_STATE_DIR/);
  });
});
