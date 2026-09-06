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
