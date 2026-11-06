import { NextRequest, NextResponse } from "next/server";
import { appStoreUrl, playStoreUrl, resolvePlatform } from "@/lib/app-store-link";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const source = params.get("src");
  const platform = resolvePlatform({
    platform: params.get("platform"),
    userAgent: request.headers.get("user-agent"),
  });
  const destination =
    platform === "android"
      ? playStoreUrl({ source })
      : appStoreUrl({ country: request.headers.get("x-vercel-ip-country"), source });
  const response = NextResponse.redirect(destination, 302);

  // The destination varies by visitor country and device, so never let a CDN
  // reuse a redirect generated for someone else.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "x-vercel-ip-country, user-agent");

  return response;
}
