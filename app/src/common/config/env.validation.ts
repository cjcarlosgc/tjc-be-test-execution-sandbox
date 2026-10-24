import { isAbsolute } from 'node:path';

/**
 * Validación de entorno al arrancar. Antes, un valor numérico mal escrito caía en silencio al valor por defecto
 * (`getNumberConfig`); ahora el proceso no arranca y lista todos los problemas a la vez.
 * Un valor vacío cuenta como no definido.
 */
const POSITIVE_INTEGERS = [
  'SANDBOX_POLL_AFTER_MS', 'SANDBOX_WORKSPACE_TTL_MS', 'SANDBOX_EXECUTION_DEADLINE_MS', 'SANDBOX_MAX_WORKSPACE_BYTES',
  'SANDBOX_SWEEPER_INTERVAL_MS', 'SANDBOX_DOWNLOAD_TIMEOUT_MS', 'SANDBOX_MAX_DOWNLOAD_BYTES', 'SANDBOX_MAX_ZIP_ENTRIES',
  'SANDBOX_MAX_UNCOMPRESSED_BYTES', 'SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES', 'SANDBOX_MAX_COMPRESSION_RATIO',
  'SANDBOX_CONTAINER_MEMORY_BYTES', 'SANDBOX_CONTAINER_NANO_CPUS', 'SANDBOX_CONTAINER_PIDS_LIMIT', 'SANDBOX_CONTAINER_TIMEOUT_MS',
  'SANDBOX_CONTAINER_MAX_OUTPUT_BYTES', 'SANDBOX_INSTALL_TIMEOUT_MS', 'SANDBOX_TEST_TIMEOUT_MS',
  'SANDBOX_MAX_CONCURRENT_EXECUTIONS', 'SANDBOX_EXECUTION_RETENTION_MS', 'SANDBOX_EXECUTION_MAX_RETAINED',
] as const;
const NON_NEGATIVE_INTEGERS = ['SANDBOX_DOWNLOAD_MAX_REDIRECTS', 'SANDBOX_DOWNLOAD_MAX_RETRIES'] as const;
const PORTS = ['PORT', 'SANDBOX_DOCKER_PORT'] as const;
const BOOLEANS = ['SANDBOX_RECONCILE_ORPHANS_ON_START'] as const;
/** Si se define, debe ser una ruta absoluta (no vacía). Si no, se usa el directorio por defecto del usuario. */
const ABSOLUTE_PATHS = ['SANDBOX_EXECUTION_STATE_DIR'] as const;

const isSet = (value: unknown): boolean => value !== undefined && value !== null && String(value).trim() !== '';

export function validateSandboxEnv(config: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];
  const integer = (key: string, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const raw = config[key];
    if (!isSet(raw)) return;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${key} debe ser un entero entre ${min} y ${max} (recibido "${String(raw)}")`);
    }
  };
  POSITIVE_INTEGERS.forEach((key) => integer(key, 1));
  NON_NEGATIVE_INTEGERS.forEach((key) => integer(key, 0));
  PORTS.forEach((key) => integer(key, 1, 65535));
  BOOLEANS.forEach((key) => {
    const raw = config[key];
    if (isSet(raw) && !['true', 'false'].includes(String(raw))) problems.push(`${key} debe ser "true" o "false" (recibido "${String(raw)}")`);
  });
  ABSOLUTE_PATHS.forEach((key) => {
    const raw = config[key];
    if (isSet(raw) && !isAbsolute(String(raw).trim())) problems.push(`${key} debe ser una ruta absoluta (recibido "${String(raw)}")`);
  });
  if (problems.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
