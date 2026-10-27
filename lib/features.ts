// Site-wide feature switch. While false, the site only exposes the word
// library (/cards, /category, /word, /search) and 物見 (/atlas): the
// learning/account features below are removed from navigation, their
// entry points inside pages are hidden, and their routes redirect to /cards.
// Flip to true to bring everything back — no other code needs to change.
export const PERSONAL_FEATURES_ENABLED = false;

export const PERSONAL_ROUTE_PREFIXES = [
  "/today",
  "/study",
  "/progress",
  "/me",
  "/favorites",
  "/settings",
];

export function isHiddenRoute(pathname: string): boolean {
  if (PERSONAL_FEATURES_ENABLED) return false;
  return PERSONAL_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
