import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account, admin and API surfaces carry nothing a searcher can use.
      disallow: [
        "/admin",
        "/api/",
        "/auth/",
        "/login",
        "/signin",
        "/register",
        "/me",
        "/settings",
        "/favorites",
        "/progress",
        "/study",
        "/atlas/study",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
