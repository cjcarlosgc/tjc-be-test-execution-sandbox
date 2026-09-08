import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ZipFile } from 'yazl';

/** Construye un ZIP en memoria a partir de `{ path: content }` para fixtures de test. */
export function buildZipFixture(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    for (const [entryPath, content] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(content, 'utf8'), entryPath);
    }

    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

async function listFilesRecursively(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files;
}

/**
 * Construye un ZIP en memoria a partir de un directorio real en disco
 * (fixtures de proyectos reales committeados, p. ej. para el pipeline
 * completo con `pnpm install`/`vitest` reales). `wrapInFolder`, si se da,
 * envuelve cada entrada bajo esa carpeta (simula el patrón real de exports
 * de GitHub/`zip -r carpeta/`, una única carpeta contenedora de nivel
 * superior).
 */
export async function buildZipFixtureFromDir(
  dir: string,
  options: { wrapInFolder?: string } = {},
): Promise<Buffer> {
  const relativeFiles = await listFilesRecursively(dir);
  const zip = new ZipFile();
  for (const relativePath of relativeFiles) {
    const content = await fs.readFile(path.join(dir, relativePath));
    const entryPath = relativePath.split(path.sep).join('/');
    zip.addBuffer(
      content,
      options.wrapInFolder ? `${options.wrapInFolder}/${entryPath}` : entryPath,
    );
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}
