import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppHttpException } from './app-http-exception.js';
import type { ErrorEnvelope } from './error-envelope.js';
import type { RequestWithCorrelationId } from './correlation-id.middleware.js';

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId & Request>();
    const correlationId = request.correlationId ?? 'unknown';

    const { statusCode, code, message, details } = this.resolve(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${code} correlationId=${correlationId} path=${request.originalUrl}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const envelope: ErrorEnvelope = {
      statusCode,
      code,
      message,
      details,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    response.status(statusCode).json(envelope);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details: unknown | null;
  } {
    if (exception instanceof AppHttpException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      const message = this.extractMessage(body, exception.message);
      return {
        statusCode,
        code: DEFAULT_CODE_BY_STATUS[statusCode] ?? 'HTTP_ERROR',
        message,
        details: this.extractDetails(body),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected internal error.',
      details: null,
    };
  }

  private extractMessage(body: unknown, fallback: string): string {
    if (typeof body === 'string') {
      return body;
    }
    if (body && typeof body === 'object' && 'message' in body) {
      const value = (body as { message: unknown }).message;
      if (typeof value === 'string') {
        return value;
      }
      if (Array.isArray(value)) {
        return value.join('; ');
      }
    }
    return fallback;
  }

  private extractDetails(body: unknown): unknown | null {
    if (body && typeof body === 'object' && 'message' in body) {
      const value = (body as { message: unknown }).message;
      if (Array.isArray(value)) {
        return value;
      }
    }
    return null;
  }
}
