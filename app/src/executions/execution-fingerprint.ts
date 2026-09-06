import { createHash } from 'node:crypto';
import type { CreateSandboxExecutionRequestDto } from './dto/create-execution-request.dto.js';
import type { EphemeralDownloadRefDto } from './dto/ephemeral-download-ref.dto.js';

/**
 * Excludes `url` and `expiresAt` per INTEROP-1.1 7.2: re-signing or extending
 * expiry does not by itself change the logical identity of the request.
 */
function normalizeDownloadRef(ref: EphemeralDownloadRefDto) {
  return { role: ref.role, sha256: ref.sha256, sizeBytes: ref.sizeBytes };
}

export function computeRequestFingerprint(
  dto: CreateSandboxExecutionRequestDto,
): string {
  const normalized = {
    requestId: dto.requestId,
    testRunId: dto.testRunId,
    projectVersionId: dto.projectVersionId,
    snapshot: normalizeDownloadRef(dto.snapshot),
    artifacts: [...dto.artifacts]
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        relativePath: artifact.relativePath,
        artifactType: artifact.artifactType,
        download: normalizeDownloadRef(artifact.download),
      }))
      .sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    scope: dto.scope,
    targetIds: [...dto.targetIds].sort(),
    runnerHint: dto.runnerHint,
  };
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}
