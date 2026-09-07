const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Formato genérico de UUID (cualquier versión/variante): Core deriva
 * `Idempotency-Key`/`requestId` como UUID v5 (`DEC-IDEMP-001`), distinto de
 * los v4 que genera `randomUUID()` en este servicio.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
