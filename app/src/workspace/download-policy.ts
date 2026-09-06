import type { EphemeralDownloadRef } from '../common/contracts/sandbox-execution.contract.js';
import {
  InputDownloadFailedError,
  InputUrlExpiredError,
} from '../common/errors/sandbox-fact-error.js';

/**
 * INTEROP-1.1 §7.1 / object-storage-access: solo HTTPS, host permitido por
 * configuración y referencia no expirada. No decide integridad de contenido
 * (eso ocurre después de descargar, comparando sha256/sizeBytes).
 */
export function assertDownloadPolicy(
  ref: EphemeralDownloadRef,
  allowedHosts: string[],
  now: Date = new Date(),
): URL {
  let parsed: URL;
  try {
    parsed = new URL(ref.url);
  } catch {
    throw new InputDownloadFailedError(
      'download URL is not well-formed',
      'CONFIGURATION',
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new InputDownloadFailedError(
      'download URL must use https',
      'CONFIGURATION',
    );
  }

  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new InputDownloadFailedError(
      `download host is not allowed: ${parsed.hostname}`,
      'CONFIGURATION',
    );
  }

  const expiresAtMs = Date.parse(ref.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= now.getTime()) {
    throw new InputUrlExpiredError('download reference has expired');
  }

  return parsed;
}
