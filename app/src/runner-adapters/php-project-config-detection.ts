import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Detección de configuración PHP ya presente en el snapshot (composer.json
 * y config de PHPUnit): solo lee archivos, nunca instala ni ejecuta nada.
 * Mirror de `project-config-detection.ts` (package.json) para Composer.
 */
export async function readComposerJson(
  workspacePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(
      path.join(workspacePath, 'composer.json'),
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

export function declaresComposerDependency(
  composerJson: Record<string, unknown> | null,
  packageName: string,
): boolean {
  if (!composerJson) {
    return false;
  }
  const require = composerJson.require;
  const requireDev = composerJson['require-dev'];
  const inRequire =
    typeof require === 'object' && require !== null && packageName in require;
  const inRequireDev =
    typeof requireDev === 'object' &&
    requireDev !== null &&
    packageName in requireDev;
  return inRequire || inRequireDev;
}
