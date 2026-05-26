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

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
};

module.exports = nextConfig;
