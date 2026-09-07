import type { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as path from 'node:path';
import { getNumberConfig } from './get-number-config.js';

export interface SandboxLimitsConfig {
  workspaceRoot: string;
  workspaceTtlMs: number;
  executionDeadlineMs: number;
  maxWorkspaceBytes: number;
  allowedDownloadHosts: string[];
  downloadTimeoutMs: number;
  downloadMaxRedirects: number;
  downloadMaxRetries: number;
  maxDownloadBytes: number;
  maxZipEntries: number;
  maxTotalUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxCompressionRatio: number;
}

const DEFAULT_WORKSPACE_ROOT = path.join(os.tmpdir(), 'tjc-sandbox-workspaces');

export function resolveSandboxLimits(
  configService: ConfigService,
): SandboxLimitsConfig {
  const allowedHostsRaw = configService.get<string>(
    'SANDBOX_ALLOWED_DOWNLOAD_HOSTS',
    '',
  );

  return {
    workspaceRoot:
      configService.get<string>('SANDBOX_WORKSPACE_ROOT', '') ||
      DEFAULT_WORKSPACE_ROOT,
    workspaceTtlMs: getNumberConfig(
      configService,
      'SANDBOX_WORKSPACE_TTL_MS',
      30 * 60 * 1000,
    ),
    executionDeadlineMs: getNumberConfig(
      configService,
      'SANDBOX_EXECUTION_DEADLINE_MS',
      10 * 60 * 1000,
    ),
    maxWorkspaceBytes: getNumberConfig(
      configService,
      'SANDBOX_MAX_WORKSPACE_BYTES',
      2 * 1024 * 1024 * 1024,
    ),
    allowedDownloadHosts: allowedHostsRaw
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host.length > 0),
    downloadTimeoutMs: getNumberConfig(
      configService,
      'SANDBOX_DOWNLOAD_TIMEOUT_MS',
      15_000,
    ),
    downloadMaxRedirects: getNumberConfig(
      configService,
      'SANDBOX_DOWNLOAD_MAX_REDIRECTS',
      1,
    ),
    downloadMaxRetries: getNumberConfig(
      configService,
      'SANDBOX_DOWNLOAD_MAX_RETRIES',
      2,
    ),
    maxDownloadBytes: getNumberConfig(
      configService,
      'SANDBOX_MAX_DOWNLOAD_BYTES',
      200 * 1024 * 1024,
    ),
    maxZipEntries: getNumberConfig(
      configService,
      'SANDBOX_MAX_ZIP_ENTRIES',
      20_000,
    ),
    maxTotalUncompressedBytes: getNumberConfig(
      configService,
      'SANDBOX_MAX_UNCOMPRESSED_BYTES',
      500 * 1024 * 1024,
    ),
    maxEntryUncompressedBytes: getNumberConfig(
      configService,
      'SANDBOX_MAX_ENTRY_UNCOMPRESSED_BYTES',
      100 * 1024 * 1024,
    ),
    maxCompressionRatio: getNumberConfig(
      configService,
      'SANDBOX_MAX_COMPRESSION_RATIO',
      100,
    ),
  };
}
