import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BearerAuthGuard } from '../common/auth/bearer-auth.guard.js';
import { AppHttpException } from '../common/http/app-http-exception.js';
import { CorrelationId } from '../common/http/correlation-id.decorator.js';
import { IdempotencyKey } from '../common/http/idempotency-key.decorator.js';
import { isUuid } from '../common/validation/uuid.js';
import { CreateSandboxExecutionRequestDto } from './dto/create-execution-request.dto.js';
import type {
  SandboxExecutionAcceptedResponse,
  SandboxExecutionResultResponse,
  SandboxExecutionStatusResponse,
} from './dto/responses.js';
import { ExecutionsService } from './executions.service.js';

@UseGuards(BearerAuthGuard)
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body() dto: CreateSandboxExecutionRequestDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @CorrelationId() correlationId: string,
  ): SandboxExecutionAcceptedResponse {
    if (!idempotencyKey) {
      throw new AppHttpException(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header is required.',
      );
    }
    if (!isUuid(idempotencyKey)) {
      throw new AppHttpException(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key header must be a valid UUID.',
      );
    }
    return this.executionsService.create(dto, idempotencyKey, correlationId);
  }

  @Get(':executionId')
  getStatus(
    @Param('executionId') executionId: string,
  ): SandboxExecutionStatusResponse {
    return this.executionsService.getStatus(executionId);
  }

  @Get(':executionId/result')
  getResult(
    @Param('executionId') executionId: string,
  ): SandboxExecutionResultResponse {
    return this.executionsService.getResult(executionId);
  }
}
