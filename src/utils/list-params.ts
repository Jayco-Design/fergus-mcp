/**
 * Checks for list parameters the Partner API validates. The tools' input
 * schemas describe these limits, but nothing enforces a schema before a
 * handler runs, so handlers check them to give a clear error instead of an
 * API 400.
 */

/** The Partner API's list endpoints accept a page size of 1 to 100. */
export const MAX_PAGE_SIZE = 100;

/** Throws if pageSize is given and isn't a whole number from 1 to 100. */
export function checkPageSize(pageSize: unknown): void {
  if (pageSize === undefined || pageSize === null) return;
  const n = Number(pageSize);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be a whole number from 1 to ${MAX_PAGE_SIZE}. Nothing was listed.`);
  }
}

/** Throws if value is given and isn't one of the allowed values. */
export function checkOneOf(name: string, value: unknown, allowed: readonly string[]): void {
  if (value === undefined || value === null || value === '') return;
  if (!allowed.includes(String(value))) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}. Nothing was listed.`);
  }
}
