import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Detección de configuración del runner de tests declarada en el proyecto.
 * Distinto de la detección del package manager (`DEC-SBX-002`, PENDING):
 * solo lee `package.json`/archivos de config ya presentes en el snapshot,
 * sin instalar nada ni resolver un gestor de paquetes.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function hasAnyConfigFile(
  workspacePath: string,
  fileNames: string[],
): Promise<boolean> {
  for (const fileName of fileNames) {
    if (await fileExists(path.join(workspacePath, fileName))) {
      return true;
    }
  }
  return false;
}

export async function readPackageJson(
  workspacePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(
      path.join(workspacePath, 'package.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function declaresDependency(
  packageJson: Record<string, unknown> | null,
  dependencyName: string,
): boolean {
  if (!packageJson) {
    return false;
  }
  const dependencies = packageJson.dependencies;
  const devDependencies = packageJson.devDependencies;
  const inDeps =
    typeof dependencies === 'object' &&
    dependencies !== null &&
    dependencyName in dependencies;
  const inDevDeps =
    typeof devDependencies === 'object' &&
    devDependencies !== null &&
    dependencyName in devDependencies;
  return inDeps || inDevDeps;
}
