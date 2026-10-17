import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isRelativePath', async: false })
export class IsRelativePathConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    if (value.startsWith('/') || value.startsWith('\\')) {
      return false;
    }
    if (/^[a-zA-Z]:/.test(value)) {
      return false;
    }
    const segments = value.split('/');
    return segments.every((segment) => segment !== '..' && segment !== '.');
  }

  defaultMessage(): string {
    return 'must be a normalized POSIX relative path without traversal segments';
  }
}

export function IsRelativePath(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsRelativePathConstraint,
    });
  };
}

/**
 * `projectRoot` admite únicamente `.` o una ruta POSIX estrictamente
 * normalizada. A diferencia de las rutas de artefactos, `.` es la raíz
 * legacy explícita del repositorio (INTEROP-2.8 §7.2).
 */
@ValidatorConstraint({ name: 'isProjectRootPath', async: false })
export class IsProjectRootPathConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    if (value === '.') {
      return true;
    }
    if (
      value.startsWith('/') ||
      value.startsWith('\\') ||
      /^[a-zA-Z]:/.test(value) ||
      value.includes('\\')
    ) {
      return false;
    }
    const segments = value.split('/');
    return segments.every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    );
  }

  defaultMessage(): string {
    return 'must be . or a normalized POSIX relative path without traversal segments';
  }
}

export function IsProjectRootPath(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsProjectRootPathConstraint,
    });
  };
}
