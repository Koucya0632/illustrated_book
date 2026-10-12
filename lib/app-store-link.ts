// Where /download sends a visitor, and how a download gets traced back to the
// link that produced it.
//
// App Store Connect attributes a download to a campaign only when the link
// carries BOTH `pt` (our provider id) and `ct` (a campaign name we choose);
// either one alone is ignored. So `/download?src=threads` becomes `ct=threads`
// and shows up as its own row under App Analytics → Sources → Campaigns.
// Without a `src` the link stays the plain product page, as before.

export const APP_STORE_ID = "6781950004";

// The provider id from App Store Connect → App Analytics → Generate Campaign
// Link. Not a secret — it is printed in every campaign link. Until it is set,
// `src` is accepted and dropped: a link posted today starts counting the day
// this is filled in, with no need to re-post it.
export const APP_STORE_PROVIDER_ID: string | null = null;

const DEFAULT_STOREFRONT = "jp";
const COUNTRY_CODE = /^[A-Z]{2}$/;
// Apple caps a campaign name at 40 characters. Anything outside this set is
// refused rather than cleaned up: a mangled name would open a second, similar
// looking row in the report.
const CAMPAIGN = /^[A-Za-z0-9_-]{1,40}$/;

export function resolveStorefront(country: string | null): string {
  const normalized = country?.trim().toUpperCase();
  return normalized && COUNTRY_CODE.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_STOREFRONT;
}

export function resolveCampaign(source: string | null): string | null {
  const trimmed = source?.trim();
  return trimmed && CAMPAIGN.test(trimmed) ? trimmed : null;
}

export function appStoreUrl(input: {
  country: string | null;
  source: string | null;
  providerId?: string | null;
}): string {
  const base = `https://apps.apple.com/${resolveStorefront(input.country)}/app/id${APP_STORE_ID}`;
  const providerId =
    input.providerId === undefined ? APP_STORE_PROVIDER_ID : input.providerId;
  const campaign = resolveCampaign(input.source);
  if (!providerId || !campaign) return base;
  const query = new URLSearchParams({ pt: providerId, ct: campaign, mt: "8" });
  return `${base}?${query}`;
}
