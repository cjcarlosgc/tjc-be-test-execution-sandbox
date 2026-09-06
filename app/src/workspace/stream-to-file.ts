import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InputDownloadFailedError } from '../common/errors/sandbox-fact-error.js';

export interface StreamToFileResult {
  sizeBytes: number;
  sha256: string;
}

/**
 * Escribe `source` en `destinationPath` calculando su sha256 mientras
 * transmite, abortando tan pronto se excede `maxBytes` (defensa contra
 * respuestas más grandes que lo declarado o lo configurado).
 */
export async function streamToFileWithLimit(
  source: Readable,
  destinationPath: string,
  maxBytes: number,
): Promise<StreamToFileResult> {
  const hash = createHash('sha256');
  let total = 0;

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(
          new InputDownloadFailedError(
            `download exceeds the maximum allowed size of ${maxBytes} bytes`,
          ),
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(source, limiter, createWriteStream(destinationPath));
  } catch (error) {
    if (error instanceof InputDownloadFailedError) {
      throw error;
    }
    throw new InputDownloadFailedError(
      `download stream failed: ${(error as Error).message}`,
    );
  }

  return { sizeBytes: total, sha256: hash.digest('hex') };
}
