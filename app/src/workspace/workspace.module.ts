import { Module } from '@nestjs/common';
import {
  EXECUTION_INPUT_DOWNLOAD_SERVICE,
  FETCH_CLIENT,
  HttpExecutionInputDownloadService,
} from './execution-input-download.service.js';
import { SafeArchiveExtractor } from './safe-archive-extractor.js';
import { WorkspaceManager } from './workspace-manager.js';

@Module({
  providers: [
    WorkspaceManager,
    SafeArchiveExtractor,
    { provide: FETCH_CLIENT, useValue: fetch },
    {
      provide: EXECUTION_INPUT_DOWNLOAD_SERVICE,
      useClass: HttpExecutionInputDownloadService,
    },
  ],
  exports: [
    WorkspaceManager,
    SafeArchiveExtractor,
    EXECUTION_INPUT_DOWNLOAD_SERVICE,
  ],
})
export class WorkspaceModule {}
