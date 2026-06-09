// Supabase SSR helper for middleware — refreshes the auth cookie on each
// request and returns the user (or null).
//
// Also pipes the validated user.id to downstream route handlers via the
// `x-user-id` request header (see `getUserIdFromHeaders` in
// `lib/current-user.ts`). This eliminates a duplicate
// `supabase.auth.getUser()` call inside every authenticated route handler
// — that call is ~170-645ms against Supabase auth, and the original log
// showed it running twice per request (middleware + route).
//
// SECURITY: we deliberately strip any incoming `x-user-id` before
// trusting it, so a client can't smuggle in a forged identity for routes
// that read this header.
//
// MOBILE: native clients (iOS / Android) send
//   Authorization: Bearer <supabase_access_token>
// instead of cookies. We validate the token via the service-role admin
// client, then pipe `x-user-id` through the same channel as the cookie
// path. Cookies are never set/refreshed for mobile callers.

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const USER_ID_HEADER = "x-user-id";

export async function updateSupabaseSession(req: NextRequest) {
  // Drop any client-supplied value FIRST; we re-set it below only after
  // supabase has validated the JWT against its auth server.
  req.headers.delete(USER_ID_HEADER);

  // ─── Bearer path (mobile clients) ───────────────────────────────────
  // If Authorization: Bearer <token> is present, validate via service-role
  // admin client and stamp x-user-id. Don't touch cookies. Invalid Bearer
  // falls through to the cookie path (defensive — might be a stray header).
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await admin.auth.getUser(bearer);
    if (data?.user && !error) {
      req.headers.set(USER_ID_HEADER, data.user.id);
      return {
        response: NextResponse.next({ request: req }),
        user: data.user,
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value),
          );
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Trigger token refresh if needed; also returns the current user.
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    req.headers.set(USER_ID_HEADER, user.id);
    // Rebuild the response so the new request header propagates to the
    // route handler. Preserve any cookies the supabase client set above.
    const passthrough = NextResponse.next({ request: req });
    response.cookies.getAll().forEach((c) => {
      const { name, value, ...options } = c;
      passthrough.cookies.set(name, value, options);
    });
    response = passthrough;
  }

  return { response, user };
}
