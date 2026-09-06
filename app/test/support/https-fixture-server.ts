import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

export interface FixtureServer {
  baseUrl: string;
  host: string;
  close(): Promise<void>;
}

function generateSelfSignedCert(): { key: string; cert: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-e2e-cert-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  return {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8'),
  };
}

/** Sirve buffers fijos por ruta sobre HTTPS con un certificado autofirmado, para probar la descarga real de EphemeralDownloadRef sin depender de una red externa. */
export function startFixtureServer(
  routes: Record<string, () => Buffer>,
): Promise<FixtureServer> {
  const { key, cert } = generateSelfSignedCert();

  return new Promise((resolve, reject) => {
    const server = https.createServer({ key, cert }, (req, res) => {
      const handler = req.url ? routes[req.url] : undefined;
      if (!handler) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = handler();
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(body);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `https://127.0.0.1:${address.port}`,
        host: '127.0.0.1',
        close: () =>
          new Promise((res, rej) => {
            server.close((error) => (error ? rej(error) : res()));
          }),
      });
    });
  });
}
