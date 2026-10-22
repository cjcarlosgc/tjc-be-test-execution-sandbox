import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BearerAuthGuard } from '../common/auth/bearer-auth.guard.js';
import { CorrelationIdMiddleware } from '../common/http/correlation-id.middleware.js';
import { HttpExceptionFilter } from '../common/http/http-exception.filter.js';
import { validateContract } from '../contracts/contract-validator.js';
import { ExecutionPipelineService } from './execution-pipeline.service.js';
import { EXECUTION_REPOSITORY, InMemoryExecutionRepository } from './execution.repository.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';

/** Contrato Core ↔ Sandbox (INTEROP-2.17 §7, §10) con los ejemplos canónicos de spec/contracts/schemas/examples. */
const examples = resolve(__dirname, '../../../spec/contracts/schemas/examples');
const load = <T = Record<string, any>>(name: string): T => JSON.parse(readFileSync(resolve(examples, name), 'utf8')) as T;
const SCHEMA = 'sandbox-execution.schema.json' as const;
const TOKEN = 'contract-test-token';
const auth = { Authorization: `Bearer ${TOKEN}` };

describe('contrato Core ↔ Sandbox (HTTP)', () => {
  let app: INestApplication;
  let repository: InMemoryExecutionRepository;

  beforeAll(async () => {
    repository = new InMemoryExecutionRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [ExecutionsController],
      providers: [
        ExecutionsService,
        BearerAuthGuard,
        { provide: EXECUTION_REPOSITORY, useValue: repository },
        { provide: ExecutionPipelineService, useValue: { run: async () => undefined } },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => (key === 'SANDBOX_SERVICE_TOKEN' ? TOKEN : fallback) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: any, res: any, next: any) => new CorrelationIdMiddleware().use(req, res, next));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  const post = (body: unknown, idempotencyKey?: string) =>
    request(app.getHttpServer()).post('/executions').set(auth).set('Idempotency-Key', idempotencyKey ?? (body as { requestId: string }).requestId).send(body as object);

  it.each(['sandbox-create-request.node.json', 'sandbox-create-request.php.json'])('acepta el request canónico %s y responde 202 con SandboxExecutionAcceptedResponse', async (name) => {
    const body = load(name);
    expect(validateContract(SCHEMA, 'CreateSandboxExecutionRequest', body).errors).toEqual([]);
    const response = await post(body);
    expect(response.status, JSON.stringify(response.body)).toBe(202);
    const check = validateContract(SCHEMA, 'SandboxExecutionAcceptedResponse', response.body);
    expect(check.errors).toEqual([]);
    expect(response.body.requestId).toBe(body.requestId);
  });

  it('acepta un request sin phase (tolerancia transitoria de INTEROP-2.17 §7.2)', async () => {
    const { phase: _omitted, ...body } = load('sandbox-create-request.node.json');
    const response = await post({ ...body, requestId: '99999999-9999-4999-8999-999999999999' });
    expect(response.status, JSON.stringify(response.body)).toBe(202);
    expect(validateContract(SCHEMA, 'SandboxExecutionAcceptedResponse', response.body).errors).toEqual([]);
  });

  it('GET /executions/{id} responde SandboxExecutionStatusResponse', async () => {
    const accepted = await post(load('sandbox-create-request.node.json'));
    const response = await request(app.getHttpServer()).get(`/executions/${accepted.body.executionId}`).set(auth);
    expect(response.status).toBe(200);
    expect(validateContract(SCHEMA, 'SandboxExecutionStatusResponse', response.body).errors).toEqual([]);
  });

  it('GET /executions/{id}/result responde SandboxExecutionResultResponse para un resultado terminal', async () => {
    const example = load('sandbox-result.completed.json');
    const accepted = await post(load('sandbox-create-request.node.json'));
    const record = repository.findById(accepted.body.executionId)!;
    Object.assign(record, {
      status: 'COMPLETED', stage: null, startedAt: example.startedAt, completedAt: example.completedAt,
      result: { facts: example.facts, failure: example.failure, stageDurations: example.stageDurations, appliedArtifactIds: example.appliedArtifactIds, evidence: example.evidence },
    });
    const response = await request(app.getHttpServer()).get(`/executions/${accepted.body.executionId}/result`).set(auth);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(validateContract(SCHEMA, 'SandboxExecutionResultResponse', response.body).errors).toEqual([]);
    expect(response.body.facts).toEqual(example.facts);
    expect(response.body.stageDurations).toEqual(example.stageDurations);
    expect(response.body.evidence).toEqual(example.evidence);
  });

  describe('los errores cumplen el ErrorEnvelope canónico', () => {
    const envelope = (body: unknown) => validateContract('error-envelope.schema.json', null, body);

    it('request con un campo no declarado → 400', async () => {
      const response = await post({ ...load('sandbox-create-request.node.json'), command: 'rm -rf /' });
      expect(response.status).toBe(400);
      expect(envelope(response.body).errors).toEqual([]);
    });

    it('sin Authorization → 401', async () => {
      const response = await request(app.getHttpServer()).get('/executions/00000000-0000-4000-8000-000000000001');
      expect(response.status).toBe(401);
      expect(envelope(response.body).errors).toEqual([]);
    });

    it('Idempotency-Key distinta de requestId → 400', async () => {
      const response = await post(load('sandbox-create-request.node.json'), '12345678-1234-4234-8234-123456789012');
      expect(response.status).toBe(400);
      expect(envelope(response.body).errors).toEqual([]);
    });

    it('ejecución inexistente → 404', async () => {
      const response = await request(app.getHttpServer()).get('/executions/00000000-0000-4000-8000-0000000000ff').set(auth);
      expect(response.status).toBe(404);
      expect(envelope(response.body).errors).toEqual([]);
    });
  });
});
