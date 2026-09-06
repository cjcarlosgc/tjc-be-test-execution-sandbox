import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppHttpException } from '../http/app-http-exception.js';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');

    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new AppHttpException(
        401,
        'UNAUTHORIZED',
        'Missing or malformed Authorization header.',
      );
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    const expectedToken = this.configService.get<string>(
      'SANDBOX_SERVICE_TOKEN',
    );

    if (!expectedToken || !this.isEqual(token, expectedToken)) {
      throw new AppHttpException(
        401,
        'UNAUTHORIZED',
        'Invalid service token.',
      );
    }

    return true;
  }

  private isEqual(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
