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
