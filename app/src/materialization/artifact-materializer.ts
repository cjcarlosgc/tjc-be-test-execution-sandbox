import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ExecutionArtifactInput } from '../common/contracts/sandbox-execution.contract.js';
import {
  EXECUTION_INPUT_DOWNLOAD_SERVICE,
  type ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';

@Injectable()
export class ArtifactMaterializer {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    @Inject(EXECUTION_INPUT_DOWNLOAD_SERVICE)
    private readonly downloadService: ExecutionInputDownloadService,
  ) {}

  /**
   * Descarga y escribe cada artefacto (CREATED o MODIFIED) en su
   * `relativePath` validado dentro del workspace. El snapshot original nunca
   * se toca: el workspace ya es una copia efímera. Devuelve los
   * `artifactId` aplicados en el orden recibido.
   */
  async applyArtifacts(
    workspacePath: string,
    artifacts: ExecutionArtifactInput[],
  ): Promise<string[]> {
    const appliedArtifactIds: string[] = [];
    for (const artifact of artifacts) {
      const destination = this.workspaceManager.resolveWithin(
        workspacePath,
        artifact.relativePath,
      );
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await this.downloadService.downloadToFile(
        artifact.download,
        destination,
      );
      appliedArtifactIds.push(artifact.artifactId);
    }
    return appliedArtifactIds;
  }
}
