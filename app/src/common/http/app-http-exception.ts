import { HttpException } from '@nestjs/common';

export class AppHttpException extends HttpException {
  readonly code: string;
  readonly details: unknown | null;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: unknown | null = null,
  ) {
    super({ code, message, details }, statusCode);
    this.code = code;
    this.details = details;
  }
}
