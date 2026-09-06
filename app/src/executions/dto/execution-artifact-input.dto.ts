import { Type } from 'class-transformer';
import { IsIn, IsUUID, ValidateNested } from 'class-validator';
import { EphemeralDownloadRefDto } from './ephemeral-download-ref.dto.js';
import { IsRelativePath } from '../../common/validation/relative-path.validator.js';
import type { ExecutionArtifactType } from '../domain/execution-record.js';

export class ExecutionArtifactInputDto {
  @IsUUID()
  artifactId!: string;

  @IsRelativePath()
  relativePath!: string;

  @IsIn(['CREATED', 'MODIFIED'])
  artifactType!: ExecutionArtifactType;

  @ValidateNested()
  @Type(() => EphemeralDownloadRefDto)
  download!: EphemeralDownloadRefDto;
}
