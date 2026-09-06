import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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
