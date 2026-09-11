import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Muchos snapshots reales (exports de GitHub, `zip -r carpeta/`, etc.)
 * envuelven todo el proyecto en una única carpeta contenedora de nivel
 * superior (`mi-proyecto/package.json` en vez de `package.json`). Esta
 * función solo *detecta* esa carpeta y devuelve su ruta absoluta — nunca
 * mueve ni renombra nada en disco. Un aplanado físico desalinearía
 * `artifact.relativePath` (que Core sigue enviando relativo a la estructura
 * original, envoltorio incluido) contra `ArtifactMaterializer`, que resuelve
 * esos artefactos directamente contra la raíz cruda del workspace.
 *
 * El resultado solo debe usarse para los consumidores que necesitan
 * localizar el proyecto real (`hasPnpmLockfile`, `readPackageJson`/
 * `hasAnyConfigFile` vía los adapters de runner, y el working directory del
 * container de instalación/ejecución) — nunca para resolver artefactos.
 */
/**
 * Entradas espurias que macOS agrega a los ZIP creados con `zip`/Finder
 * (`__MACOSX/`, `.DS_Store`). Se ignoran solo para *decidir* si hay una
 * única carpeta contenedora — no se tocan en disco.
 */
const MACOS_ARCHIVE_ARTIFACTS = new Set(['__MACOSX', '.DS_Store']);

export async function resolveProjectRoot(workspacePath: string): Promise<string> {
  const topLevelEntries = await fs.readdir(workspacePath, {
    withFileTypes: true,
  });
  const relevantEntries = topLevelEntries.filter(
    (entry) => !MACOS_ARCHIVE_ARTIFACTS.has(entry.name),
  );
  if (relevantEntries.length !== 1 || !relevantEntries[0].isDirectory()) {
    return workspacePath;
  }
  return path.join(workspacePath, relevantEntries[0].name);
}
