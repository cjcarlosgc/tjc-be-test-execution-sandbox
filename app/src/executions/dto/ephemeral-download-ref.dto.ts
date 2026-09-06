import { IsIn, IsInt, IsISO8601, IsUrl, Min } from 'class-validator';
import { IsSha256 } from '../../common/validation/sha256.validator.js';
import type { ExecutionInputRole } from '../domain/execution-record.js';

export class EphemeralDownloadRefDto {
  @IsIn(['PROJECT_SNAPSHOT', 'GENERATED_ARTIFACT'])
  role!: ExecutionInputRole;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsISO8601()
  expiresAt!: string;

  @IsSha256()
  sha256!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
