import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DOCKERFILE_PATH = fileURLToPath(
  new URL('../../docker/php/Dockerfile', import.meta.url),
);
const INI_PATH = fileURLToPath(new URL('../../docker/php/zz-sandbox.ini', import.meta.url));

/**
 * WI-SANDBOX-021 (estático, sin Docker): la imagen gestionada del profile
 * PHP_LARAVEL_PHPUNIT debe traer las extensiones añadidas en 021, las
 * herramientas de sistema y la identidad fija `sandbox` (UID/GID 10001), y
 * no debe incorporar código de proyecto ni credenciales.
 */
describe('app/docker/php/Dockerfile (estático)', () => {
  it('instala intl, gd, zip, bcmath y gmp con docker-php-ext-install', async () => {
    const dockerfile = await fs.readFile(DOCKERFILE_PATH, 'utf8');
    const extInstall = /docker-php-ext-install\s+([^\n;&|]*)/.exec(dockerfile)?.[1];

    expect(extInstall, 'falta docker-php-ext-install').toBeDefined();
    const extensions = (extInstall ?? '')
      .split(/\s+/)
      .filter((token) => token !== '' && !token.startsWith('-'));
    expect(extensions).toEqual(expect.arrayContaining(['intl', 'gd', 'zip', 'bcmath', 'gmp']));
    expect(dockerfile).toMatch(/docker-php-ext-configure gd\b[^\n;]*--with-jpeg/);
    expect(dockerfile).toMatch(/docker-php-ext-configure gd\b[^\n;]*--with-freetype/);
    expect(dockerfile).toMatch(/docker-php-ext-configure gd\b[^\n;]*--with-webp/);
  });

  it('conserva acl, unzip y Composer 2 copiado de la imagen oficial', async () => {
    const dockerfile = await fs.readFile(DOCKERFILE_PATH, 'utf8');
    const aptInstall = /apt-get install[^;]*/.exec(dockerfile)?.[0] ?? '';

    expect(aptInstall).toMatch(/\bacl\b/);
    expect(aptInstall).toMatch(/\bunzip\b/);
    expect(dockerfile).toMatch(/^FROM \$\{COMPOSER_IMAGE\} AS composer$/m);
    expect(dockerfile).toMatch(
      /^COPY --from=composer \/usr\/bin\/composer \/usr\/local\/bin\/composer$/m,
    );
  });

  it('crea el usuario sandbox con UID/GID 10001', async () => {
    const dockerfile = await fs.readFile(DOCKERFILE_PATH, 'utf8');

    expect(dockerfile).toMatch(/groupadd --gid 10001 sandbox/);
    expect(dockerfile).toMatch(/useradd --uid 10001 --gid sandbox/);
  });

  it('fija memory_limit = 512M en zz-sandbox.ini y lo copia al conf.d de PHP', async () => {
    const dockerfile = await fs.readFile(DOCKERFILE_PATH, 'utf8');
    const ini = await fs.readFile(INI_PATH, 'utf8');

    expect(ini).toMatch(/^memory_limit\s*=\s*512M\s*$/m);
    expect(dockerfile).toMatch(
      /^COPY zz-sandbox\.ini \/usr\/local\/etc\/php\/conf\.d\/zz-sandbox\.ini$/m,
    );
  });

  it('solo copia el script de ACL, Composer y el ini; nunca código de proyecto ni credenciales', async () => {
    const dockerfile = await fs.readFile(DOCKERFILE_PATH, 'utf8');
    const instructions = dockerfile
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    // ADD puede traer tarballs o URLs remotas: no se usa en la imagen.
    expect(instructions.some((line) => /^ADD\s/i.test(line))).toBe(false);

    const copySources = instructions
      .filter((line) => /^COPY\s/i.test(line))
      .map((line) => line.replace(/^COPY\s+/i, '').split(/\s+/))
      .map((tokens) => tokens.filter((token) => !token.startsWith('--')))
      .map((tokens) => tokens.slice(0, -1));
    const allowedSources = [
      ['/usr/bin/composer'],
      ['restore-workspace-acl'],
      ['zz-sandbox.ini'],
    ];
    for (const sources of copySources) {
      const allowed = allowedSources.some((expected) => expected.every((s) => sources.includes(s)));
      expect(allowed, `COPY no permitido: ${sources.join(' ')}`).toBe(true);
    }

    expect(dockerfile).not.toMatch(/\.env\b/);
    expect(dockerfile).not.toMatch(/\bsrc\/|\bnode_modules\b|\bvendor\/|\bid_rsa\b|\.pem\b/);
  });
});
