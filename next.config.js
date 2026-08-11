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

const remotePatterns = [];
if (supabaseHost) {
  remotePatterns.push({ protocol: "https", hostname: supabaseHost });
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
      publicEntry("/api/words"),
      publicEntry("/api/words/:id"),
      publicEntry("/api/categories"),
      // /api/search is public or per-user depending on the request. With
      // `learning` the URL carries the whole identity — the same URL means the
      // same rows for everyone — so the edge may cache it. Without it the rows
      // follow the caller's stored 學習語言, so only the requesting device may.
      //
      // It used to be in neither list, which is how it ended up serving a bare
      // `Cache-Control: public`: the handler asked for `public, s-maxage=60,
      // stale-while-revalidate=300`, Next stripped the bounds off a
      // searchParam-reading handler, and the unbounded grant survived.
      {
        ...publicEntry("/api/search"),
        has: [{ type: "query", key: "learning" }],
      },
      {
        source: "/api/search",
        missing: [{ type: "query", key: "learning" }],
        // `private` and not `no-store`: these are public catalogue rows, and
        // the device that asked is allowed to reuse its own copy. What must
        // never happen is a *shared* cache handing one user's language slice
        // to another.
        headers: [{ key: "Cache-Control", value: "private, max-age=60" }],
      },
      privateEntry("/api/users/:path*"),
      privateEntry("/api/study/:path*"),
      privateEntry("/api/events"),
    ];
  },
};

module.exports = nextConfig;
