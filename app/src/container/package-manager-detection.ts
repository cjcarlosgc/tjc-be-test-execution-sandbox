import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ExecutionProfile } from '../common/contracts/sandbox-execution.contract.js';
import { UnsupportedPackageManagerError } from '../common/errors/sandbox-fact-error.js';

/**
 * `DEC-SBX-002` (APROBADO): V1 soporta únicamente pnpm, detectado por la
 * presencia de `pnpm-lock.yaml` en el snapshot ya extraído. No instala ni
 * ejecuta nada; solo lee el nombre del archivo.
 */
export async function hasPnpmLockfile(workspacePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(workspacePath, 'pnpm-lock.yaml'));
    return true;
  } catch {
    return false;
  }
}

/**
 * INTEROP-2.0 §7.2: `PHP_LARAVEL_PHPUNIT` exige `composer.json` (usa
 * `composer.lock` cuando existe, pero no es obligatorio). Solo lee el
 * nombre del archivo.
 */
export async function hasComposerJson(workspacePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(workspacePath, 'composer.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica el manifest de package manager exigido por cada profile
 * (009/INTEROP-2.0 §7.2) antes de instalar nada. Una incompatibilidad
 * termina explícitamente como `UNSUPPORTED_PACKAGE_MANAGER`/`CONFIGURATION`,
 * nunca infiere ni intenta otro package manager.
 */
export async function assertSupportedManifest(
  executionProfile: ExecutionProfile,
  projectRoot: string,
): Promise<void> {
  if (executionProfile === 'NODE_TYPESCRIPT') {
    if (!(await hasPnpmLockfile(projectRoot))) {
      throw new UnsupportedPackageManagerError(
        'project does not declare a pnpm-lock.yaml (V1 only supports pnpm, DEC-SBX-002)',
      );
    }
    return;
  }
  if (!(await hasComposerJson(projectRoot))) {
    throw new UnsupportedPackageManagerError(
      'project does not declare a composer.json (PHP_LARAVEL_PHPUNIT requires Composer)',
    );
  }
}
