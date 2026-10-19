import * as path from 'node:path';

/** Unidad de disco de Windows al inicio de una ruta (`C:/...` tras normalizar `\`). */
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:\//;

/**
 * Convierte el nombre de suite que informa el runner (`testResults[].name` en Jest/Vitest, `testsuite[@name]` en JUnit)
 * en `suitePath` (INTEROP §7.3: `RelativePath`). Los runners informan la ruta absoluta del archivo dentro del
 * contenedor; por eso:
 * - Una ruta absoluta bajo `containerRoot` (la raíz del proyecto dentro del contenedor) se relativiza a esa raíz.
 * - Una ruta ya relativa se normaliza con separadores POSIX.
 * - Cualquier otra ruta (fuera de la raíz, unidad de Windows o con `..` tras normalizar) se reduce a su nombre base.
 * Nunca devuelve una ruta absoluta ni con `..`. No reescribe mensajes de error ni otros campos.
 */
export function toRelativeSuitePath(name: string | null | undefined, containerRoot?: string): string | null {
  if (typeof name !== 'string') return null;
  const posixName = name.trim().replace(/\\/g, '/');
  if (posixName === '') return null;

  if (!isAbsoluteRunnerPath(posixName)) {
    const normalized = path.posix.normalize(posixName).replace(/^\.\//, '');
    return isSafeRelativePath(normalized) ? normalized : baseNameOrNull(posixName);
  }

  if (containerRoot !== undefined) {
    const root = path.posix.normalize(containerRoot.trim().replace(/\\/g, '/'));
    if (root.startsWith('/')) {
      const prefix = root.endsWith('/') ? root : `${root}/`;
      const absolute = path.posix.normalize(posixName);
      if (absolute.startsWith(prefix)) {
        const relative = absolute.slice(prefix.length);
        if (isSafeRelativePath(relative)) return relative;
      }
    }
  }

  return baseNameOrNull(posixName);
}

function isAbsoluteRunnerPath(posixName: string): boolean {
  return posixName.startsWith('/') || WINDOWS_DRIVE_PREFIX.test(posixName);
}

function isSafeRelativePath(relative: string): boolean {
  if (relative === '' || relative === '.' || isAbsoluteRunnerPath(relative)) return false;
  return !relative.split('/').includes('..');
}

function baseNameOrNull(posixName: string): string | null {
  const base = path.posix.basename(posixName);
  return isSafeRelativePath(base) ? base : null;
}
