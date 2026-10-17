import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EphemeralDownloadRefDto } from './ephemeral-download-ref.dto.js';
import { ExecutionArtifactInputDto } from './execution-artifact-input.dto.js';
import { IsProjectRootPath } from '../../common/validation/relative-path.validator.js';
import type {
  ExecutionPhase,
  ExecutionProfile,
  ExecutionScope,
  TestRunner,
} from '../domain/execution-record.js';

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

  /** INTEROP-2.8 §7.2. Omitido conserva la raíz legacy `.`. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsProjectRootPath()
  projectRoot?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExecutionArtifactInputDto)
  artifacts!: ExecutionArtifactInputDto[];

  @IsIn(['TARGET', 'BATCH'])
  scope!: ExecutionScope;

  @IsArray()
  @IsUUID('4', { each: true })
  targetIds!: string[];

  @IsIn(['NODE_TYPESCRIPT', 'PHP_LARAVEL_PHPUNIT'])
  executionProfile!: ExecutionProfile;

  @IsIn(['JEST', 'VITEST', 'PHPUNIT'])
  runnerHint!: TestRunner;

  /** INTEROP §7.2. Opcional mientras Core no lo envíe (default `GENERATED_TESTS`). */
  @IsOptional()
  @IsIn(['BASELINE', 'GENERATED_TESTS'])
  phase?: ExecutionPhase;
}
