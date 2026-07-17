import { NextRequest, NextResponse } from "next/server";

const APP_STORE_ID = "6781950004";
const DEFAULT_STOREFRONT = "jp";
const COUNTRY_CODE = /^[A-Z]{2}$/;

function resolveStorefront(country: string | null) {
  const normalized = country?.trim().toUpperCase();
  return normalized && COUNTRY_CODE.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_STOREFRONT;
}

export function GET(request: NextRequest) {
  const storefront = resolveStorefront(request.headers.get("x-vercel-ip-country"));
  const destination = `https://apps.apple.com/${storefront}/app/id${APP_STORE_ID}`;
  const response = NextResponse.redirect(destination, 302);

  // The destination varies by visitor country, so never let a CDN reuse a
  // redirect generated for a different storefront.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "x-vercel-ip-country");

  return response;
}
