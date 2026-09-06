import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { ArtifactMaterializer } from './artifact-materializer.js';

@Module({
  imports: [WorkspaceModule],
  providers: [ArtifactMaterializer],
  exports: [ArtifactMaterializer],
})
export class MaterializationModule {}
