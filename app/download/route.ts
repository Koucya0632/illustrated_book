import { NextRequest, NextResponse } from "next/server";
import { appStoreUrl } from "@/lib/app-store-link";

export function GET(request: NextRequest) {
  const destination = appStoreUrl({
    country: request.headers.get("x-vercel-ip-country"),
    source: request.nextUrl.searchParams.get("src"),
  });
  const response = NextResponse.redirect(destination, 302);

  // The destination varies by visitor country, so never let a CDN reuse a
  // redirect generated for a different storefront.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "x-vercel-ip-country");

  return response;
}
