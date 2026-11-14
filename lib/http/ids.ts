// Route parameter checks shared by every handler that takes an id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A database uuid (v1–v5), the only shape an item / image / collection id takes. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
