import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SandboxFailureFact } from '../common/contracts/sandbox-execution.contract.js';
import { SandboxFactError } from '../common/errors/sandbox-fact-error.js';
import { ArtifactMaterializer } from '../materialization/artifact-materializer.js';
import {
  EXECUTION_INPUT_DOWNLOAD_SERVICE,
  type ExecutionInputDownloadService,
} from '../workspace/execution-input-download.service.js';
import { SafeArchiveExtractor } from '../workspace/safe-archive-extractor.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import type { ExecutionRecord } from './domain/execution-record.js';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepository,
} from './execution.repository.js';

const SNAPSHOT_STAGING_FILENAME = '__snapshot__.zip';

/**
 * Orquesta la etapa `PREPARING` (002-project-workspace + 003-test-materialization):
 * crea el workspace, descarga y extrae el snapshot y materializa los
 * artefactos generados. Las etapas posteriores (instalación de dependencias,
 * compilación, ejecución de tests) dependen de `DEC-SBX-002` y de
 * 004-container-execution/005-test-runner-adapters, todavía no implementadas;
 * un `PREPARING` exitoso permanece en ese estado a la espera de esas features.
 */
@Injectable()
export class ExecutionPipelineService {
  private readonly logger = new Logger(ExecutionPipelineService.name);

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly repository: ExecutionRepository,
    private readonly workspaceManager: WorkspaceManager,
    private readonly archiveExtractor: SafeArchiveExtractor,
    @Inject(EXECUTION_INPUT_DOWNLOAD_SERVICE)
    private readonly downloadService: ExecutionInputDownloadService,
    private readonly artifactMaterializer: ArtifactMaterializer,
  ) {}

  /**
   * Ejecuta la preparación. El controller la dispara sin `await` (`void`)
   * para no bloquear el `202`; los tests pueden esperarla directamente.
   */
  run(executionId: string): Promise<void> {
    return this.prepare(executionId).catch((error: unknown) => {
      this.logger.error(
        `unhandled pipeline error for ${executionId}: ${(error as Error).message}`,
      );
    });
  }

  private async prepare(executionId: string): Promise<void> {
    const record = this.repository.findById(executionId);
    if (!record) {
      return;
    }

    const startedAt = record.startedAt ?? new Date().toISOString();
    this.repository.save({
      ...record,
      status: 'PREPARING',
      stage: 'PREPARING',
      startedAt,
      updatedAt: new Date().toISOString(),
    });

    let workspacePath: string | undefined;
    try {
      workspacePath = await this.workspaceManager.createWorkspace(executionId);
      const snapshotZipPath = path.join(
        workspacePath,
        SNAPSHOT_STAGING_FILENAME,
      );

      await this.downloadService.downloadToFile(
        record.snapshot,
        snapshotZipPath,
      );
      await this.archiveExtractor.extract(snapshotZipPath, workspacePath);
      await fs.rm(snapshotZipPath, { force: true });

      const appliedArtifactIds = await this.artifactMaterializer.applyArtifacts(
        workspacePath,
        record.artifacts,
      );

      this.repository.save({
        ...this.mustFind(executionId),
        updatedAt: new Date().toISOString(),
      });
      this.logger.log(
        `execution ${executionId} prepared workspace with ${appliedArtifactIds.length} artifact(s) at ${workspacePath}`,
      );
    } catch (error) {
      const failure = this.toFailureFact(error);
      const now = new Date().toISOString();
      this.repository.save({
        ...this.mustFind(executionId),
        status: 'FAILED',
        failureCode: failure.code,
        failureMessage: failure.message,
        completedAt: now,
        updatedAt: now,
        result: {
          facts: null,
          failure,
          stageDurations: [],
          appliedArtifactIds: [],
          evidence: [],
        },
      });
      this.logger.warn(
        `execution ${executionId} failed during PREPARING: ${failure.code} ${failure.message}`,
      );
      if (workspacePath) {
        await this.workspaceManager.cleanup(workspacePath);
      }
    }
  }

  private mustFind(executionId: string): ExecutionRecord {
    const record = this.repository.findById(executionId);
    if (!record) {
      throw new Error(`execution ${executionId} disappeared during pipeline run`);
    }
    return record;
  }

  private toFailureFact(error: unknown): SandboxFailureFact {
    if (error instanceof SandboxFactError) {
      return {
        stage: 'PREPARING',
        category: error.category,
        code: error.code,
        message: error.message,
      };
    }
    return {
      stage: 'PREPARING',
      category: 'UNKNOWN',
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'unknown error',
    };
  }
}
