import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const IdempotencyKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.header(IDEMPOTENCY_KEY_HEADER);
    return header && header.trim().length > 0 ? header.trim() : undefined;
  },
);
