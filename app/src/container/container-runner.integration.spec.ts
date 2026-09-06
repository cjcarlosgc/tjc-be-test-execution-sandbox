import type { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContainerRunner } from './container-runner.service.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

async function isDockerAvailable(docker: Dockerode): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

const docker = new Dockerode();
// Se evalúa al cargar el archivo (top-level await) porque `skipIf` decide en
// tiempo de registro, antes de que `beforeAll` pueda ejecutarse.
const dockerAvailable = await isDockerAvailable(docker);

/**
 * Integración real contra el Docker Engine local (Docker Desktop/VM Linux,
 * architecture.md). Se omite automáticamente si el daemon no está
 * accesible, para no romper `pnpm test` en un entorno sin Docker.
 */
describe.skipIf(!dockerAvailable)(
  'ContainerRunner (integración real con Docker Engine)',
  () => {
    let workspaceDir: string;

    beforeAll(async () => {
      workspaceDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'container-runner-it-'),
      );
      await fs.writeFile(
        path.join(workspaceDir, 'package.json'),
        '{"name":"smoke"}',
        'utf8',
      );
    });

    afterAll(async () => {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    });

    it(
      'creates, runs, captures output and removes a real container',
      async () => {
        const runner = new ContainerRunner(docker, fakeConfigService());
        const executionId = '99999999-9999-4999-8999-999999999999';

        const result = await runner.runSmokeCheck(executionId, workspaceDir);

        expect(result.timedOut).toBe(false);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toMatch(/^v\d+\.\d+\.\d+/);

        const containers = await docker.listContainers({ all: true });
        const leftover = containers.find((c) =>
          c.Names.includes(`/sandbox-${executionId}`),
        );
        expect(leftover).toBeUndefined();
      },
      120_000,
    );
  },
);
