import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const DOCKER_CONTEXT = fileURLToPath(
  new URL('../../docker/php', import.meta.url),
);
const SCRIPT_PATH = path.join(DOCKER_CONTEXT, 'restore-workspace-acl');
const TEST_IMAGE = 'tjc-sandbox-php-acl-spec:local';
const VOLUME = `tjc-acl-spec-${process.pid}`;

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

// Se evalúa al cargar el archivo: `skipIf` decide en tiempo de registro.
const hasDocker = await dockerAvailable();

/**
 * WI-SANDBOX-008: la pasada de archivos usaba `-exec setfacl … {} \;` (un
 * proceso por archivo; ~12 s en un workspace con `vendor/`). Debe agrupar
 * con `{} +`. La pasada de directorios conserva `\;`: repara cada
 * directorio ANTES de que find descienda (caso `chmod 000`).
 */
describe('restore-workspace-acl (estático)', () => {
  it('agrupa la pasada de archivos con "+" y deja la de directorios con ";"', async () => {
    const script = await fs.readFile(SCRIPT_PATH, 'utf8');
    // Cada `find` ocupa dos líneas (continuación con `\`): se captura el
    // terminador del `-exec` de cada pasada.
    const terminator = (type: 'd' | 'f'): string | undefined =>
      new RegExp(
        `-type ${type} -exec \\\\\\n\\s*setfacl[^\\n]*\\{\\} (\\\\;|\\+)\\s*$`,
        'm',
      ).exec(script)?.[1];

    expect(terminator('f')).toBe('+');
    expect(terminator('d')).toBe('\\;');
  });
});

describe.skipIf(!hasDocker)('restore-workspace-acl (conductual, Docker real)', () => {
  let shimDir: string | undefined;

  afterAll(async () => {
    await execFileAsync('docker', ['volume', 'rm', '-f', VOLUME]).catch(
      () => undefined,
    );
    await execFileAsync('docker', ['rmi', '-f', TEST_IMAGE]).catch(
      () => undefined,
    );
    if (shimDir) {
      await fs.rm(shimDir, { recursive: true, force: true });
    }
  });

  it(
    'repara ACL con pocas invocaciones de setfacl sobre archivos, incluidos chmod 000',
    async (ctx) => {
      try {
        await execFileAsync('docker', ['build', '-q', '-t', TEST_IMAGE, DOCKER_CONTEXT], {
          timeout: 240_000,
        });
      } catch {
        // Sin red/registro no se puede construir la imagen: no es un fallo del script.
        ctx.skip();
        return;
      }

      shimDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acl-shim-'));
      await fs.writeFile(
        path.join(shimDir, 'setfacl'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> /tmp/setfacl.log\nexec /usr/bin/setfacl "$@"\n',
        { mode: 0o755 },
      );

      const docker = (args: string[]) =>
        execFileAsync('docker', args, { timeout: 120_000 });
      await docker(['volume', 'create', VOLUME]);
      await docker([
        'run', '--rm', '-v', `${VOLUME}:/app`, '--entrypoint', 'sh', TEST_IMAGE,
        '-c', 'chown 10001:10001 /app',
      ]);
      // Árbol creado por el runner: 50 directorios × 10 archivos, con un
      // archivo y un directorio que el código "no confiable" deja en 000.
      await docker([
        'run', '--rm', '-v', `${VOLUME}:/app`, '--user', '10001:10001',
        '--cap-drop', 'ALL', '--entrypoint', 'sh', TEST_IMAGE, '-c',
        'cd /app && i=0; while [ $i -lt 50 ]; do mkdir -p d$i; j=0; ' +
          'while [ $j -lt 10 ]; do echo x > d$i/f$j; j=$((j+1)); done; ' +
          'i=$((i+1)); done; chmod 000 d3/f1; chmod 000 d7',
      ]);

      const recovery = await docker([
        'run', '--rm', '-v', `${VOLUME}:/app`, '-v', `${shimDir}:/shim:ro`,
        '-e', 'PATH=/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        '--user', '10001:10001', '--cap-drop', 'ALL', '--network', 'none',
        '--entrypoint', 'sh', TEST_IMAGE, '-c',
        'restore-workspace-acl 1000 /app; echo EXIT=$?; ' +
          'echo FILE_CALLS=$(grep -c "u::rw-" /tmp/setfacl.log)',
      ]);
      expect(recovery.stdout).toContain('EXIT=0');
      const fileCalls = Number(/FILE_CALLS=(\d+)/.exec(recovery.stdout)?.[1]);
      // 500 archivos: con `\;` serían ~500 invocaciones; agrupadas, una o pocas.
      expect(fileCalls).toBeGreaterThan(0);
      expect(fileCalls).toBeLessThanOrEqual(10);

      const host = await docker([
        'run', '--rm', '-v', `${VOLUME}:/app`, '--user', '1000:1000',
        '--cap-drop', 'ALL', '--entrypoint', 'sh', TEST_IMAGE, '-c',
        '[ -x /app/d7 ] && [ -r /app/d7/f0 ] && [ -r /app/d3/f1 ] && echo HOST_OK',
      ]);
      expect(host.stdout).toContain('HOST_OK');
    },
    360_000,
  );
});
