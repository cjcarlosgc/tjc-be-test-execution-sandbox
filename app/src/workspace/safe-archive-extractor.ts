import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import {
  resolveSandboxLimits,
  type SandboxLimitsConfig,
} from '../common/config/sandbox-limits.config.js';
import {
  InvalidArchiveError,
  InvalidArtifactPathError,
} from '../common/errors/sandbox-fact-error.js';

const SYMLINK_UNIX_FILE_TYPE = 0xa000;
const UNIX_FILE_TYPE_MASK = 0xf000;

@Injectable()
export class SafeArchiveExtractor {
  private readonly limits: SandboxLimitsConfig;

  constructor(configService: ConfigService) {
    this.limits = resolveSandboxLimits(configService);
  }

  /**
   * Extrae `zipPath` dentro de `destinationRoot` aplicando defensas contra
   * Zip Slip, entradas absolutas, symlinks y zip bombs (temporary-workspaces
   * / resource-limits transversal specs). Si el archivo entero vive bajo una
   * única carpeta contenedora de nivel superior, esa carpeta se aplana al
   * terminar la extracción — ver `flattenSingleTopLevelDirectory`.
   */
  async extract(zipPath: string, destinationRoot: string): Promise<void> {
    const resolvedRoot = path.resolve(destinationRoot);
    let zip: yauzl.ZipFile;
    try {
      zip = await yauzl.openPromise(zipPath, {
        lazyEntries: true,
        autoClose: true,
        validateEntrySizes: true,
        strictFileNames: true,
      });
    } catch (error) {
      throw new InvalidArchiveError(
        `unable to open archive: ${(error as Error).message}`,
      );
    }

    if (zip.entryCount > this.limits.maxZipEntries) {
      zip.close();
      throw new InvalidArchiveError(
        `archive has too many entries (${zip.entryCount})`,
      );
    }

    let totalUncompressed = 0;

    try {
      for await (const entry of zip.eachEntry()) {
        this.assertSafeEntryName(entry.fileName);
        this.assertSafeEntryMode(entry);

        totalUncompressed += entry.uncompressedSize;
        if (entry.uncompressedSize > this.limits.maxEntryUncompressedBytes) {
          throw new InvalidArchiveError(`entry too large: ${entry.fileName}`);
        }
        if (totalUncompressed > this.limits.maxTotalUncompressedBytes) {
          throw new InvalidArchiveError(
            'archive exceeds the maximum total uncompressed size',
          );
        }
        if (entry.compressedSize > 0) {
          const ratio = entry.uncompressedSize / entry.compressedSize;
          if (ratio > this.limits.maxCompressionRatio) {
            throw new InvalidArchiveError(
              `entry compression ratio too high: ${entry.fileName}`,
            );
          }
        }

        const destination = this.resolveEntryPath(resolvedRoot, entry.fileName);

        if (entry.fileName.endsWith('/')) {
          await fs.mkdir(destination, { recursive: true });
          continue;
        }

        await fs.mkdir(path.dirname(destination), { recursive: true });
        const stream = await zip.openReadStreamPromise(entry);
        await pipeline(stream, createWriteStream(destination));
      }
    } finally {
      if (zip.isOpen) {
        zip.close();
      }
    }

    await this.flattenSingleTopLevelDirectory(resolvedRoot);
  }

  /**
   * Muchos snapshots reales (exports de GitHub, `zip -r carpeta/`, etc.)
   * envuelven todo el proyecto en una única carpeta contenedora de nivel
   * superior (`mi-proyecto/package.json` en vez de `package.json`). Sin
   * aplanar esa carpeta, todo chequeo downstream que asume el proyecto en la
   * raíz del workspace (`readPackageJson`, `hasAnyConfigFile`,
   * `hasPnpmLockfile`, y la resolución de `relativePath` de artefactos en
   * `ArtifactMaterializer`) fallaría en encontrar cualquier archivo. Se
   * detecta y aplana aquí, una sola vez, para que todos esos consumidores
   * puedan seguir asumiendo una estructura plana sin cada uno tener que
   * reimplementar la detección.
   */
  private async flattenSingleTopLevelDirectory(root: string): Promise<void> {
    const topLevelEntries = await fs.readdir(root, { withFileTypes: true });
    if (topLevelEntries.length !== 1 || !topLevelEntries[0].isDirectory()) {
      return;
    }

    const wrapperPath = path.join(root, topLevelEntries[0].name);
    const wrappedEntries = await fs.readdir(wrapperPath);
    for (const wrappedEntry of wrappedEntries) {
      await fs.rename(
        path.join(wrapperPath, wrappedEntry),
        path.join(root, wrappedEntry),
      );
    }
    await fs.rmdir(wrapperPath);
  }

  private resolveEntryPath(root: string, entryName: string): string {
    const normalized = entryName.replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
      throw new InvalidArtifactPathError(
        `unsafe archive entry path: ${entryName}`,
      );
    }
    const resolved = path.resolve(root, normalized);
    const withinRoot =
      resolved === root || resolved.startsWith(root + path.sep);
    if (!withinRoot) {
      throw new InvalidArtifactPathError(
        `archive entry escapes destination: ${entryName}`,
      );
    }
    return resolved;
  }

  private assertSafeEntryName(entryName: string): void {
    if (!entryName || entryName.trim().length === 0) {
      throw new InvalidArchiveError('archive entry has an empty name');
    }
  }

  private assertSafeEntryMode(entry: yauzl.Entry): void {
    const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
    const fileType = unixMode & UNIX_FILE_TYPE_MASK;
    if (fileType === SYMLINK_UNIX_FILE_TYPE) {
      throw new InvalidArchiveError(
        `archive entry is a symlink: ${entry.fileName}`,
      );
    }
  }
}
