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

function buildFakeContainer(options: FakeContainerOptions = {}) {
  return {
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
}

/**
 * El bootstrap del store de pnpm (ver container-runner.service.ts) crea un
 * container `*-bootstrap` propio antes del container "principal" de cada
 * test. Le damos su propio fake siempre exitoso para no acoplar el
 * `FakeContainerOptions` de cada test (pensado para el container principal:
 * smoke/install/test) al resultado del bootstrap.
 */
function buildFakeDocker(options: FakeContainerOptions = {}) {
  const container = buildFakeContainer(options);
  const bootstrapContainer = buildFakeContainer();

  const docker = {
    createContainer: vi.fn(
      async (config: { name: string }) =>
        config.name.includes('bootstrap') ? bootstrapContainer : container,
    ),
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

  return { docker, container, bootstrapContainer };
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

  it('installs dependencies via corepack pnpm@<version> with network, a writable mount and the shared pnpm store', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({
        SANDBOX_PNPM_VERSION: '9',
        SANDBOX_PNPM_STORE_VOLUME: 'sandbox-pnpm-store',
      }),
    );

    await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      'NODE_TYPESCRIPT',
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sandbox-11111111-1111-4111-8111-111111111111-install',
        Cmd: [
          'corepack',
          'pnpm@9',
          'install',
          '--frozen-lockfile',
          '--store-dir',
          '/pnpm-store',
        ],
        HostConfig: expect.objectContaining({
          Binds: ['/tmp/workspace:/app', 'sandbox-pnpm-store:/pnpm-store'],
          NetworkMode: 'bridge',
        }),
      }),
    );
  });

  it('bootstraps the pnpm store volume ownership as root before the first install, once per runner instance', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(
      docker as never,
      fakeConfigService({ SANDBOX_CONTAINER_USER: 'node' }),
    );

    await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      'NODE_TYPESCRIPT',
    );
    await runner.installDependencies(
      '22222222-2222-4222-8222-222222222222',
      '/tmp/workspace',
      'NODE_TYPESCRIPT',
    );

    const bootstrapCalls = (
      docker.createContainer as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (call: unknown[]) =>
        (call[0] as { name: string }).name.includes('bootstrap'),
    );
    expect(bootstrapCalls).toHaveLength(1);
    expect(bootstrapCalls[0][0]).toEqual(
      expect.objectContaining({
        Cmd: ['chown', 'node', '/pnpm-store'],
        User: 'root',
        HostConfig: expect.objectContaining({
          Binds: ['sandbox-pnpm-store:/pnpm-store'],
          NetworkMode: 'none',
        }),
      }),
    );
  });

  it('uses the given workingDir as the container cwd, without changing the mount', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(docker as never, fakeConfigService());

    await runner.installDependencies(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      'NODE_TYPESCRIPT',
      undefined,
      '/app/my-project',
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        WorkingDir: '/app/my-project',
        HostConfig: expect.objectContaining({
          Binds: ['/tmp/workspace:/app', 'sandbox-pnpm-store:/pnpm-store'],
        }),
      }),
    );
  });

  it('defaults the container cwd to /app when no workingDir is given', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(docker as never, fakeConfigService());

    await runner.runTestCommand(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      ['node_modules/.bin/vitest', 'run'],
      'NODE_TYPESCRIPT',
    );

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ WorkingDir: '/app' }),
    );
  });

  it('runs the test command without network on a writable mount', async () => {
    const { docker } = buildFakeDocker();
    const runner = new ContainerRunner(docker as never, fakeConfigService());

    await runner.runTestCommand(
      '11111111-1111-4111-8111-111111111111',
      '/tmp/workspace',
      ['node_modules/.bin/vitest', 'run', '--reporter=json'],
      'NODE_TYPESCRIPT',
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
      'NODE_TYPESCRIPT',
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
      'NODE_TYPESCRIPT',
      10,
    );

    expect(result.timedOut).toBe(true);
    expect(container.kill).toHaveBeenCalledTimes(1);
  });
});
