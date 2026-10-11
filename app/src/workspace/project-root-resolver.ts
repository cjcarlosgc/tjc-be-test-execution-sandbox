import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { InvalidProjectRootError } from '../common/errors/sandbox-fact-error.js';

const DEFAULT_PROJECT_ROOT = '.';

/**
 * Resuelve exclusivamente la raíz que Core ya congeló para el snapshot.
 * Sandbox no busca manifests ni elige un candidato: valida que el valor
 * POSIX normalizado exista dentro de `repositoryRoot`, incluso después de
 * resolver symlinks (INTEROP-2.8 §7.2).
 */
export async function resolveProjectRoot(
  repositoryRoot: string,
  requestedProjectRoot: string = DEFAULT_PROJECT_ROOT,
): Promise<string> {
  if (!isNormalizedProjectRoot(requestedProjectRoot)) {
    throw new InvalidProjectRootError(
      `projectRoot must be . or a normalized POSIX relative path: ${requestedProjectRoot}`,
    );
  }

  const repositoryRealPath = await fs.realpath(repositoryRoot);
  // Conserva la representación léxica de `repositoryRoot` para que las
  // rutas de artefactos repo-relative no mezclen, por ejemplo, `/var` y su
  // alias real `/private/var`. `realpath` se usa solo para comprobar el
  // confinamiento frente a symlinks.
  const candidatePath = path.resolve(
    repositoryRoot,
    ...requestedProjectRoot.split('/'),
  );

  let candidateRealPath: string;
  try {
    candidateRealPath = await fs.realpath(candidatePath);
  } catch {
    throw new InvalidProjectRootError(
      `projectRoot does not exist under repositoryRoot: ${requestedProjectRoot}`,
    );
  }

  if (!isWithin(repositoryRealPath, candidateRealPath)) {
    throw new InvalidProjectRootError(
      `projectRoot escapes repositoryRoot through a symlink: ${requestedProjectRoot}`,
    );
  }

  const stats = await fs.stat(candidateRealPath);
  if (!stats.isDirectory()) {
    throw new InvalidProjectRootError(
      `projectRoot must resolve to a directory: ${requestedProjectRoot}`,
    );
  }

  return candidatePath;
}

function isNormalizedProjectRoot(value: string): boolean {
  if (value === DEFAULT_PROJECT_ROOT) {
    return true;
  }
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    value.includes('\\') ||
    /^[a-zA-Z]:/.test(value) ||
    path.posix.normalize(value) !== value
  ) {
    return false;
  }
  return value.split('/').every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  );
}

function isWithin(repositoryRoot: string, candidate: string): boolean {
  const relative = path.relative(repositoryRoot, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}
