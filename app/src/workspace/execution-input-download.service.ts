import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import {
  resolveSandboxLimits,
  type SandboxLimitsConfig,
} from '../common/config/sandbox-limits.config.js';
import type { EphemeralDownloadRef } from '../common/contracts/sandbox-execution.contract.js';
import {
  IntegrityCheckFailedError,
  InputDownloadFailedError,
  SandboxFactError,
} from '../common/errors/sandbox-fact-error.js';
import { assertDownloadPolicy } from './download-policy.js';
import { streamToFileWithLimit } from './stream-to-file.js';

export const EXECUTION_INPUT_DOWNLOAD_SERVICE = Symbol(
  'EXECUTION_INPUT_DOWNLOAD_SERVICE',
);
export const FETCH_CLIENT = Symbol('FETCH_CLIENT');

export interface DownloadedFile {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface ExecutionInputDownloadService {
  downloadToFile(
    ref: EphemeralDownloadRef,
    destinationPath: string,
  ): Promise<DownloadedFile>;
}

export type FetchLike = typeof fetch;

@Injectable()
export class HttpExecutionInputDownloadService
  implements ExecutionInputDownloadService
{
  private readonly logger = new Logger(HttpExecutionInputDownloadService.name);
  private readonly limits: SandboxLimitsConfig;
  private readonly fetchFn: FetchLike;

  constructor(
    configService: ConfigService,
    @Optional() @Inject(FETCH_CLIENT) fetchFn?: FetchLike,
  ) {
    this.limits = resolveSandboxLimits(configService);
    this.fetchFn = fetchFn ?? fetch;
  }

  async downloadToFile(
    ref: EphemeralDownloadRef,
    destinationPath: string,
  ): Promise<DownloadedFile> {
    const url = assertDownloadPolicy(ref, this.limits.allowedDownloadHosts);
    const byteLimit =
      ref.sizeBytes > 0
        ? Math.min(ref.sizeBytes, this.limits.maxDownloadBytes)
        : this.limits.maxDownloadBytes;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.limits.downloadMaxRetries; attempt++) {
      try {
        const response = await this.fetchWithRedirects(url, 0);
        const body = response.body;
        if (!body) {
          throw new InputDownloadFailedError('response has no body');
        }
        const result = await streamToFileWithLimit(
          Readable.fromWeb(
            body as unknown as import('node:stream/web').ReadableStream,
          ),
          destinationPath,
          byteLimit,
        );

        if (
          result.sizeBytes !== ref.sizeBytes ||
          result.sha256 !== ref.sha256.toLowerCase()
        ) {
          throw new IntegrityCheckFailedError(
            'downloaded content does not match the declared sha256/sizeBytes',
          );
        }

        return {
          path: destinationPath,
          sizeBytes: result.sizeBytes,
          sha256: result.sha256,
        };
      } catch (error) {
        if (this.isNonRetryable(error)) {
          throw error;
        }
        lastError = error as Error;
        this.logger.warn(
          `download attempt ${attempt + 1} failed: ${lastError.message}`,
        );
        if (attempt < this.limits.downloadMaxRetries) {
          await delay(2 ** attempt * 200);
        }
      }
    }

    throw new InputDownloadFailedError(
      lastError?.message ?? 'download failed after retries',
    );
  }

  /** No reintenta fallos de política/integridad: solo son útiles los reintentos ante fallos transitorios de red. */
  private isNonRetryable(error: unknown): boolean {
    if (error instanceof IntegrityCheckFailedError) {
      return true;
    }
    return error instanceof SandboxFactError && error.category === 'CONFIGURATION';
  }

  private async fetchWithRedirects(
    url: URL,
    redirectCount: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.limits.downloadTimeoutMs,
    );
    try {
      const response = await this.fetchFn(url, {
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount >= this.limits.downloadMaxRedirects) {
          throw new InputDownloadFailedError(
            'too many redirects or missing Location header',
            'CONFIGURATION',
          );
        }
        const nextUrl = new URL(location, url);
        if (
          nextUrl.protocol !== 'https:' ||
          !this.limits.allowedDownloadHosts.includes(
            nextUrl.hostname.toLowerCase(),
          )
        ) {
          throw new InputDownloadFailedError(
            `redirect target is not allowed: ${nextUrl.hostname}`,
            'CONFIGURATION',
          );
        }
        return this.fetchWithRedirects(nextUrl, redirectCount + 1);
      }

      if (!response.ok) {
        throw new InputDownloadFailedError(
          `unexpected response status ${response.status}`,
        );
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
