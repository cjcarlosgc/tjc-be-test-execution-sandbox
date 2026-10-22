import {
  Body,
  Controller,
  Get,
  HttpException,
  INestApplication,
  Post,
  UseGuards,
  ValidationPipe,
  ArgumentsHost,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BearerAuthGuard } from '../auth/bearer-auth.guard.js';
import { validateContract } from '../../contracts/contract-validator.js';
import { CorrelationIdMiddleware } from './correlation-id.middleware.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

/*
 * Errores genéricos del Sandbox (INTEROP-2.18 §4.1): el envelope de cada error HTTP genérico debe validar contra
 * error-envelope.schema.json, no llevar `retryable` (el Sandbox no lo declara) y usar un `code` conocido de §4.1 o
 * HTTP_ERROR. Montaje: Nest real con el filtro, ValidationPipe, middleware de correlación y el guard reales; solo se
 * añade un controlador de sonda.
 */

const TOKEN = 'generic-errors-token';
const KNOWN_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'HTTP_ERROR',
]);

@Controller('probe')
class ProbeController {
  @Get('secured')
  @UseGuards(BearerAuthGuard)
  secured(): { ok: boolean } {
    return { ok: true };
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>): Record<string, unknown> {
    return body;
  }

  @Get('too-large')
  tooLarge(): never {
    throw new HttpException('Payload too large', 413);
  }
}

/** Valida el envelope contra el esquema canónico y las reglas de §4.1 que aplican al Sandbox. */
function expectGenericEnvelope(body: unknown, statusCode: number, code: string): void {
  expect(validateContract('error-envelope.schema.json', null, body).errors).toEqual([]);
  const envelope = body as Record<string, unknown>;
  expect(envelope.statusCode).toBe(statusCode);
  expect(envelope.code).toBe(code);
  expect(envelope).not.toHaveProperty('retryable');
  expect(KNOWN_CODES.has(envelope.code as string)).toBe(true);
}

describe('errores genéricos del Sandbox (INTEROP-2.18 §4.1) contra error-envelope.schema.json', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        BearerAuthGuard,
        { provide: ConfigService, useValue: { get: (key: string) => (key === 'SANDBOX_SERVICE_TOKEN' ? TOKEN : undefined) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: any, res: any, next: any) => new CorrelationIdMiddleware().use(req, res, next));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  it('404: ruta inexistente -> NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get('/no-existe');
    expect(response.status).toBe(404);
    expectGenericEnvelope(response.body, 404, 'NOT_FOUND');
  });

  it('404: método no soportado en ruta existente -> el framework responde 404 (Express no emite 405)', async () => {
    const response = await request(app.getHttpServer()).get('/probe/echo');
    expect(response.status).toBe(404);
    expectGenericEnvelope(response.body, 404, 'NOT_FOUND');
  });

  it('405: HttpException(405) sin código propio -> HTTP_ERROR (filtro; el Sandbox no emite METHOD_NOT_ALLOWED)', () => {
    const filter = new HttpExceptionFilter();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ correlationId: 'corr-405', originalUrl: '/probe/echo' }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new HttpException('Method Not Allowed', 405), host);
    expect(status).toHaveBeenCalledWith(405);
    const body = json.mock.calls[0][0];
    expectGenericEnvelope(body, 405, 'HTTP_ERROR');
  });

  it('413: error de body-parser (type entity.too.large, no HttpException) -> PAYLOAD_TOO_LARGE sin reflejar el texto crudo (unitario)', () => {
    const filter = new HttpExceptionFilter();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ correlationId: 'corr-413', originalUrl: '/executions' }),
      }),
    } as unknown as ArgumentsHost;
    const error = Object.assign(new Error('request entity too large (raw secreto-123)'), { type: 'entity.too.large', status: 413, statusCode: 413 });
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(413);
    const body = json.mock.calls[0][0];
    expectGenericEnvelope(body, 413, 'PAYLOAD_TOO_LARGE');
    expect(body.message).toBe('El cuerpo de la solicitud excede el límite permitido.');
    expect(JSON.stringify(body)).not.toContain('secreto-123');
  });

  it('413: HttpException(413) sin código propio -> PAYLOAD_TOO_LARGE (ruta real)', async () => {
    const response = await request(app.getHttpServer()).get('/probe/too-large');
    expect(response.status).toBe(413);
    expectGenericEnvelope(response.body, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('401: sin cabecera Authorization -> UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer()).get('/probe/secured');
    expect(response.status).toBe(401);
    expectGenericEnvelope(response.body, 401, 'UNAUTHORIZED');
  });

  it('401: token inválido -> UNAUTHORIZED (código propio del guard, mismo contrato)', async () => {
    const response = await request(app.getHttpServer()).get('/probe/secured').set('Authorization', 'Bearer otro');
    expect(response.status).toBe(401);
    expectGenericEnvelope(response.body, 401, 'UNAUTHORIZED');
  });

  // body-parser lanza PayloadTooLargeError (no es HttpException); el filtro lo mapea a 413 PAYLOAD_TOO_LARGE.
  // Caso: POST JSON de ~200 KB (límite por defecto de Express: 100 KB).
  it('413: cuerpo JSON demasiado grande (parser de Express) -> envelope PAYLOAD_TOO_LARGE', async () => {
    const big = { data: 'x'.repeat(200 * 1024) };
    const response = await request(app.getHttpServer()).post('/probe/echo').set('Content-Type', 'application/json').send(big);
    expect(response.status).toBe(413);
    expectGenericEnvelope(response.body, 413, 'PAYLOAD_TOO_LARGE');
  });
});
