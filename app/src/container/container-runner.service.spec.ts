import type { ConfigService } from '@nestjs/config';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ContainerRunner } from './container-runner.service.js';

function fakeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

interface FakeContainerOptions {
  wait?: () => Promise<{ StatusCode: number }>;
  exitCode?: number;
  oomKilled?: boolean;
  start?: () => Promise<void>;
}

function buildFakeDocker(options: FakeContainerOptions = {}) {
  const container = {
    id: 'fake-container-id',
    start: vi.fn(options.start ?? (async () => {})),
    wait: vi.fn(options.wait ?? (async () => ({ StatusCode: options.exitCode ?? 0 }))),
    kill: vi.fn(async () => {}),
    inspect: vi.fn(async () => ({
      State: { ExitCode: options.exitCode ?? 0, OOMKilled: options.oomKilled ?? false },
    })),
    remove: vi.fn(async () => {}),
    logs: vi.fn(async () => new PassThrough()),
  };

  const docker = {
    createContainer: vi.fn(async () => container),
    getImage: vi.fn(() => ({ inspect: vi.fn(async () => ({})) })),
    pull: vi.fn(async () => new PassThrough()),
    modem: {
      demuxStream: vi.fn((stream: PassThrough, stdout: PassThrough, stderr: PassThrough) => {
        // Difiere para que el listener de 'end' ya esté registrado (evita
        // emitir el evento antes de que collectLogs empiece a escucharlo).
        setImmediate(() => {
          stdout.write(Buffer.from('v22.17.0\n'));
          stdout.end();
          stderr.end();
          stream.emit('end');
        });
      }),
      followProgress: vi.fn(
        (_stream: unknown, callback: (error: Error | null) => void) => {
          callback(null);
        },
      ),
    },
  };

  return { docker, container };
}

describe('ContainerRunner', () => {
  it('runs the smoke command and captures exit code and stdout', async () => {
    const { docker, container } = buildFakeDocker({ exitCode: 0 });
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService(),
    );

    const result = await runner.runSmokeCheck(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('v22.17.0\n');
    expect(result.timedOut).toBe(false);
    expect(container.start).toHaveBeenCalledTimes(1);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('mounts the workspace read-only and applies configured limits', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({
        SANDBOX_CONTAINER_MEMORY_BYTES: 123,
        SANDBOX_CONTAINER_NANO_CPUS: 456,
        SANDBOX_CONTAINER_PIDS_LIMIT: 7,
      }),
    );

    await runner.runSmokeCheck(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: ['/tmp/workspace:/app:ro'],
          Memory: 123,
          NanoCpus: 456,
          PidsLimit: 7,
          NetworkMode: 'none',
          Privileged: false,
          CapDrop: ['ALL'],
        }),
      }),
    );
  });

  it('kills and removes the container when the timeout is exceeded', async () => {
    let resolveWait: ((value: { StatusCode: number }) => void) | undefined;
    const waitPromise = new Promise<{ StatusCode: number }>((resolve) => {
      resolveWait = resolve;
    });
    const { docker, container } = buildFakeDocker({ wait: () => waitPromise });
    // En Docker real, matar el container hace que wait() se resuelva solo.
    container.kill = vi.fn(async () => {
      resolveWait?.({ StatusCode: 137 });
    });
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({ SANDBOX_CONTAINER_TIMEOUT_MS: 10 }),
    );

    const result = await runner.runSmokeCheck(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(container.kill).toHaveBeenCalledTimes(1);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('pulls the image when it is not cached locally', async () => {
    const { docker, container } = buildFakeDocker();
    docker.getImage = vi.fn(() => ({
      inspect: vi.fn(async () => {
        throw new Error('no such image');
      }),
    }));
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService(),
    );

    await runner.runSmokeCheck(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(docker.pull).toHaveBeenCalledTimes(1);
    expect(container.start).toHaveBeenCalledTimes(1);
  });

  it('still removes the container when start() fails', async () => {
    const { docker, container } = buildFakeDocker({
      start: async () => {
        throw new Error('start failed');
      },
    });
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService(),
    );

    await expect(
      runner.runSmokeCheck(
        '11111111-1111-4111-8111-111111111111',
        '/tmp/workspace',
      ),
    ).rejects.toThrow('start failed');
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('installs dependencies via corepack pnpm@<version> with network and a writable mount', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({ SANDBOX_PNPM_VERSION: '9' }),
    );

    await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sandbox-11111111-1111-4111-8111-111111111111-install',
        Cmd: ['corepack', 'pnpm@9', 'install', '--frozen-lockfile'],
        HostConfig: expect.objectContaining({
          Binds: ['/tmp/workspace:/app'],
          NetworkMode: 'bridge',
        }),
      }),
    );
  });

  it('runs the test command without network on a writable mount', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(docker as never, fakeConfigService());

    await runner.runTestCommand(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      ['node_modules/.bin/vitest', 'run', '--reporter=json'],
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sandbox-11111111-1111-4111-8111-111111111111-test',
        Cmd: ['node_modules/.bin/vitest', 'run', '--reporter=json'],
        HostConfig: expect.objectContaining({
          Binds: ['/tmp/workspace:/app'],
          NetworkMode: 'none',
        }),
      }),
    );
  });

  it('marks stdout as truncated and reports the original byte count beyond the cap', async () => {
    const docker = {
      createContainer: vi.fn(async () => ({
        id: 'fake-id',
        start: vi.fn(async () => {}),
        wait: vi.fn(async () => ({ StatusCode: 0 })),
        kill: vi.fn(async () => {}),
        inspect: vi.fn(async () => ({ State: { ExitCode: 0 } })),
        remove: vi.fn(async () => {}),
        logs: vi.fn(async () => new PassThrough()),
      })),
      getImage: vi.fn(() => ({ inspect: vi.fn(async () => ({})) })),
      pull: vi.fn(async () => new PassThrough()),
      modem: {
        demuxStream: vi.fn(
          (stream: PassThrough, stdout: PassThrough, stderr: PassThrough) => {
            setImmediate(() => {
              stdout.write(Buffer.alloc(50, 'x'));
              stdout.end();
              stderr.end();
              stream.emit('end');
            });
          },
        ),
        followProgress: vi.fn(
          (_stream: unknown, callback: (error: Error | null) => void) => {
            callback(null);
          },
        ),
      },
    };
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({ SANDBOX_CONTAINER_MAX_OUTPUT_BYTES: 10 }),
    );

    const result = await runner.runSmokeCheck(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(result.stdout).toHaveLength(10);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdoutOriginalBytes).toBe(50);
  });

  it('reports oomKilled from the container inspect result', async () => {
    const { docker } = buildFakeDocker({ oomKilled: true, exitCode: 137 });
    const runner = new ContainerRunner(docker as never, fakeConfigService());

    const result = await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
    );

    expect(result.oomKilled).toBe(true);
    expect(result.exitCode).toBe(137);
  });

  it('clamps the effective timeout to maxTimeoutMs without exceeding it (global deadline)', async () => {
    let resolveWait: ((value: { StatusCode: number }) => void) | undefined;
    const waitPromise = new Promise<{ StatusCode: number }>((resolve) => {
      resolveWait = resolve;
    });
    const { docker, container } = buildFakeDocker({ wait: () => waitPromise });
    // En Docker real, matar el container hace que wait() se resuelva solo.
    container.kill = vi.fn(async () => {
      resolveWait?.({ StatusCode: 137 });
    });
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({ SANDBOX_INSTALL_TIMEOUT_MS: 100_000 }),
    );

    const result = await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      10,
    );

    expect(result.timedOut).toBe(true);
    expect(container.kill).toHaveBeenCalledTimes(1);
  });
});
