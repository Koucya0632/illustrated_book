/** @type {import('next').NextConfig} */
// All product images live in our own Supabase Storage bucket (`word-images`)
// after the migration in scripts/upload-images.ts. We deliberately do NOT
// whitelist any external image hosts here — newly-added words must go
// through the admin file picker (or POST /api/admin/fetch-image, which
// downloads server-side and writes to the bucket). next/image will refuse
// any URL whose host isn't in this list, which is the enforcement we want.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  } catch {
    return null;
  }
})();

const assetHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_ASSET_BASE_URL || "").hostname;
  } catch {
    return null;
  }
})();

// Both hosts stay allowed for as long as both spellings are live: the iOS app
// has absolute Supabase URLs in its own cache, so dropping that host would
// break images this deploy cannot reach. next/image refuses any host not
// listed here, and the refusal looks like a broken image, not a config error.
const remotePatterns = [];
if (supabaseHost) {
  remotePatterns.push({ protocol: "https", hostname: supabaseHost });
}
if (assetHost) {
  remotePatterns.push({ protocol: "https", hostname: assetHost });
}

// Cache directives for public GET endpoints. `max-age` drives browser /
// iOS URLCache; `s-maxage` drives the Vercel edge CDN; `stale-while-
// revalidate` lets the edge serve stale while it asks origin for a fresh
// copy. Set here in next.config.js (not in the Route Handler) because
// Next.js treats searchParam-reading handlers as dynamic and strips
// handler-set Cache-Control.
// Trial split: client `Cache-Control` controls iOS URLCache; Vercel's
// own `Vercel-CDN-Cache-Control` controls the edge. Vercel forwards
// `Cache-Control` unchanged to the client when Vercel-CDN-Cache-Control
// is present.
const CLIENT_CACHE = "public, max-age=60";
const EDGE_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
  async headers() {
    const publicEntry = (source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: CLIENT_CACHE },
        { key: "Vercel-CDN-Cache-Control", value: EDGE_CACHE },
      ],
    });
    // Defense in depth: every per-user endpoint gets `private, no-store`
    // so no intermediate proxy can stash a response keyed on path alone
    // and accidentally serve it back to another user. Routes are already
    // `force-dynamic` server-side, but this keeps the contract explicit
    // and survives a future move off Vercel.
    const privateEntry = (source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    });
    return [
      // Word/search routes set cache headers on each response. A static rule
      // here would overwrite no-store on a database failure and cache the 503.
      // Membership-aware 詞條延伸內容: the only per-caller slice of a word.
      privateEntry("/api/words/:id/insights"),
      publicEntry("/api/categories"),
      publicEntry("/api/travel"),
      privateEntry("/api/users/:path*"),
      privateEntry("/api/study/:path*"),
      privateEntry("/api/events"),
    ];
  },
};

module.exports = nextConfig;
