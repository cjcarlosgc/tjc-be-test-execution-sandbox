import { Type } from 'class-transformer';
import { IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { EphemeralDownloadRefDto } from './ephemeral-download-ref.dto.js';
import { ExecutionArtifactInputDto } from './execution-artifact-input.dto.js';
import type { ExecutionScope, RunnerHint } from '../domain/execution-record.js';

export class CreateSandboxExecutionRequestDto {
  @IsUUID()
  requestId!: string;

  @IsUUID()
  testRunId!: string;

  @IsUUID()
  projectVersionId!: string;

  @ValidateNested()
  @Type(() => EphemeralDownloadRefDto)
  snapshot!: EphemeralDownloadRefDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExecutionArtifactInputDto)
  artifacts!: ExecutionArtifactInputDto[];

  @IsIn(['TARGET', 'BATCH'])
  scope!: ExecutionScope;

  @IsArray()
  @IsUUID('4', { each: true })
  targetIds!: string[];

  @IsIn(['JEST', 'VITEST'])
  runnerHint!: RunnerHint;
}
