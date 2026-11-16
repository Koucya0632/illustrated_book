// A 合集's 簡介 as the create and edit requests carry it.
//
// Both apps send the whole form on every save, and both drop the key when the
// field is empty: iOS's synthesized Encodable skips a nil, Android encodes with
// `explicitNulls = false`. So a missing `description` means the author cleared
// the field. PATCH used to read it as "leave unchanged", which answered 200 to
// a cleared 簡介 and kept the old text.

export const COLLECTION_DESCRIPTION_MAX = 500;

/** Trimmed and capped; blank, missing or not a string is no 簡介. */
export function collectionDescriptionFrom(body: { description?: unknown }): string | null {
  if (typeof body.description !== "string") return null;
  return body.description.trim().slice(0, COLLECTION_DESCRIPTION_MAX) || null;
}
