/** @type {import('next').NextConfig} */
// Allow images served from Supabase Storage; the project URL host is derived
// at build time from NEXT_PUBLIC_SUPABASE_URL so we don't hard-code it. After
// the one-shot Wikimedia backfill all images sit in our own bucket, but we
// keep upload.wikimedia.org in the allow-list for two reasons:
//   1) scripts/upload-images.ts still reads from there during backfill
//   2) anywhere a non-migrated row slips through (e.g. a freshly admin-added
//      word that hasn't been re-uploaded yet) won't 500 next/image
// Loremflickr / unsplash / etc. are removed — no current row depends on them
// and we don't want new content to come from there.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  } catch {
    return null;
  }
})();

const remotePatterns = [
  { protocol: "https", hostname: "upload.wikimedia.org" },
];
if (supabaseHost) {
  remotePatterns.push({ protocol: "https", hostname: supabaseHost });
}

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
};

module.exports = nextConfig;
