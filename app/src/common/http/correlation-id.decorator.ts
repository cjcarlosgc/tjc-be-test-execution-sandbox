import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithCorrelationId } from './correlation-id.middleware.js';

export const CorrelationId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<RequestWithCorrelationId>();
    return request.correlationId;
  },
);
